const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { ROLE_LABELS, rolePermissions } = require('../constants/roles');
const userModel = require('../models/user.model');
const { normalizeEmail } = require('../utils/normalizers');

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await userModel.findLoginUser(email);
  if (!user) return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  if (user.status !== 'active') return res.status(403).json({ message: 'Usuário inativo.' });
  if (user.tenant_id && user.tenant_status !== 'active') return res.status(403).json({ message: 'Empresa contratante inativa.' });

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) return res.status(401).json({ message: 'E-mail ou senha inválidos.' });

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

  res.json({
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
  });
}

module.exports = { login };
