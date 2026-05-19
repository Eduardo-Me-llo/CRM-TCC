const { ROLE_LABELS, rolePermissions } = require('../constants/roles');
const userModel = require('../models/user.model');

async function me(req, res) {
  const user = await userModel.findMe(req.user.id);
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
  res.json({
    id: user.id,
    tenantId: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    status: user.status,
    tenantName: user.tenant_name,
    tenantDomain: user.tenant_domain,
    permissions: rolePermissions(user.role),
    preferences: user.preferences || {}
  });
}

async function updatePreferences(req, res) {
  const preferences = req.body.preferences || {};
  const result = await userModel.updatePreferences(req.user.id, preferences);
  res.json({ preferences: result });
}

module.exports = {
  me,
  updatePreferences
};
