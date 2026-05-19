const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { ROLES, rolePermissions } = require('../constants/roles');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token não informado.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId || null,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      permissions: rolePermissions(payload.role)
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}

function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = user.permissions || rolePermissions(user.role);
  return permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: `Acesso negado. Permissão necessária: ${permission}` });
    }
    return next();
  };
}

function requireDeveloper(req, res, next) {
  if (req.user?.role !== ROLES.DEVELOPER) {
    return res.status(403).json({ message: 'Acesso exclusivo do desenvolvedor do CRM.' });
  }
  return next();
}

function requireTenantUser(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: 'Usuário não vinculado a uma empresa contratante.' });
  }
  return next();
}

module.exports = {
  hasPermission,
  requireAuth,
  requireDeveloper,
  requirePermission,
  requireTenantUser
};
