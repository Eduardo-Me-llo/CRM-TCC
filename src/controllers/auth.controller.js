const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { JWT_SECRET } = require('../config/env');
const { ROLE_LABELS, rolePermissions } = require('../constants/roles');
const userModel = require('../models/user.model');
const systemSettingsModel = require('../models/system-settings.model');
const { isSimulatedEmail, sendEmail } = require('../services/email.service');
const { normalizeEmail } = require('../utils/normalizers');

function buildAuthResponse(user) {
  const token = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      tenantName: user.tenant_name,
      tenantDomain: user.tenant_domain,
      permissions: rolePermissions(user.role),
      preferences: user.preferences || {}
    }
  };
}

async function isPasswordLoginAllowed(user, password) {
  if (!user) return false;
  if (user.status !== 'active') return false;
  if (user.tenant_id && user.tenant_status !== 'active') return false;
  return bcrypt.compare(password, user.password_hash);
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await userModel.findLoginUser(email);
  const passwordOk = await isPasswordLoginAllowed(user, password);
  if (!passwordOk) return res.status(401).json({ message: 'E-mail ou senha invalidos.' });

  const loginEmailCodeEnabled = await systemSettingsModel.getBoolean('login_email_code_enabled', true);
  if (!loginEmailCodeEnabled) return res.json(buildAuthResponse(user));

  const code = String(crypto.randomInt(0, 100000)).padStart(5, '0');
  const codeHash = await bcrypt.hash(code, 10);
  await query(
    `INSERT INTO login_verification_codes (user_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [user.id, user.email, codeHash]
  );

  const emailResult = await sendEmail({
    to: user.email,
    subject: 'Codigo de validacao do CRM',
    text: `Seu codigo de validacao do CRM e ${code}. Ele expira em 10 minutos.`
  });

  res.json({
    requiresVerification: true,
    email: user.email,
    message: emailResult.message || 'Codigo enviado para o e-mail cadastrado.',
    devCode: isSimulatedEmail() ? code : undefined
  });
}

async function verifyLogin(req, res) {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  if (!/^\d{5}$/.test(code)) return res.status(400).json({ message: 'Informe o codigo de 5 digitos.' });

  const user = await userModel.findLoginUser(email);
  if (!user) return res.status(401).json({ message: 'Codigo invalido ou expirado.' });
  if (user.status !== 'active' || (user.tenant_id && user.tenant_status !== 'active')) {
    return res.status(403).json({ message: 'Usuario ou empresa contratante inativa.' });
  }

  const result = await query(
    `SELECT *
       FROM login_verification_codes
      WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.id]
  );
  const verification = result.rows[0];
  if (!verification) return res.status(401).json({ message: 'Codigo invalido ou expirado.' });

  const codeOk = await bcrypt.compare(code, verification.code_hash);
  if (!codeOk) return res.status(401).json({ message: 'Codigo invalido ou expirado.' });

  await query(`UPDATE login_verification_codes SET used_at = now() WHERE id = $1`, [verification.id]);
  res.json(buildAuthResponse(user));
}

module.exports = {
  login,
  verifyLogin
};
