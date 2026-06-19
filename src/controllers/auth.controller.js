const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { JWT_SECRET } = require('../config/env');
const { ROLES, ROLE_LABELS, rolePermissions } = require('../constants/roles');
const { createAuditLog } = require('../services/audit.service');
const userModel = require('../models/user.model');
const developerModel = require('../models/developer.model');
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

function hashLoginCode({ userId, email, code }) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${userId}:${normalizeEmail(email)}:${String(code || '').trim()}`)
    .digest('hex');
}

async function isLoginCodeValid({ verification, email, code }) {
  if (!verification?.code_hash) return false;

  if (String(verification.code_hash).startsWith('$2')) {
    return bcrypt.compare(code, verification.code_hash);
  }

  const expected = hashLoginCode({ userId: verification.user_id, email, code });
  const storedBuffer = Buffer.from(String(verification.code_hash), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return storedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(storedBuffer, expectedBuffer);
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
  const [passwordOk, loginEmailCodeEnabled] = await Promise.all([
    isPasswordLoginAllowed(user, password),
    systemSettingsModel.getBoolean('login_email_code_enabled', true)
  ]);
  if (!passwordOk) return res.status(401).json({ message: 'E-mail ou senha invalidos.' });

  if (!loginEmailCodeEnabled) return res.json(buildAuthResponse(user));

  const code = String(crypto.randomInt(0, 100000)).padStart(5, '0');
  const codeHash = hashLoginCode({ userId: user.id, email: user.email, code });
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

  const codeOk = await isLoginCodeValid({ verification, email: user.email, code });
  if (!codeOk) return res.status(401).json({ message: 'Codigo invalido ou expirado.' });

  await query(`UPDATE login_verification_codes SET used_at = now() WHERE id = $1`, [verification.id]);
  res.json(buildAuthResponse(user));
}

async function register(req, res) {
  const tenantName = String(req.body.tenantName || '').trim();
  const tenantDomain = String(req.body.tenantDomain || '').trim().toLowerCase().replace(/^@/, '');
  const adminName = String(req.body.adminName || '').trim();
  const adminEmail = normalizeEmail(req.body.adminEmail || '');
  const adminPassword = String(req.body.adminPassword || '');

  if (!tenantName || !tenantDomain || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }
  if (adminPassword.length < 6) {
    return res.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  const existingTenant = await query(`SELECT id FROM tenants WHERE lower(domain) = $1`, [tenantDomain]);
  if (existingTenant.rows.length) {
    return res.status(400).json({ message: 'Este domínio já está em uso.' });
  }

  const existingUser = await userModel.findLoginUser(adminEmail);
  if (existingUser) {
    return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
  }

  try {
    const tenant = await developerModel.createTenant({ name: tenantName, domain: tenantDomain });
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await developerModel.createUser({ tenantId: tenant.id, name: adminName, email: adminEmail, passwordHash, role: ROLES.ADMIN_MASTER, status: 'active' });
    const user = await userModel.findLoginUser(adminEmail);

    await createAuditLog({
      userId: user.id,
      tenantId: tenant.id,
      action: 'auth.registered',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: { tenantName, tenantDomain, adminEmail }
    });

    res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    if (error.code === '23505') {
      const message = error.detail?.includes('users_email_key')
        ? 'Este e-mail já está em uso.'
        : 'Este domínio já está em uso.';
      return res.status(400).json({ message });
    }
    throw error;
  }
}

module.exports = {
  login,
  register,
  verifyLogin
};
