const bcrypt = require('bcryptjs');
const { ROLE_LABELS, rolePermissions } = require('../constants/roles');
const userModel = require('../models/user.model');
const { createAuditLog } = require('../services/audit.service');

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

async function updatePassword(req, res) {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Senha atual, nova senha e confirmação são obrigatórias.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'A confirmação da nova senha não confere.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'A nova senha deve ser diferente da senha atual.' });
  }

  const passwordHash = await userModel.findPasswordHash(req.user.id);
  if (!passwordHash) return res.status(404).json({ message: 'Usuário não encontrado.' });

  const currentOk = await bcrypt.compare(currentPassword, passwordHash);
  if (!currentOk) return res.status(401).json({ message: 'Senha atual inválida.' });

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await userModel.updatePassword(req.user.id, newPasswordHash);
  await createAuditLog({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: 'me.password.updated',
    entityType: 'user',
    entityId: req.user.id,
    metadata: { email: req.user.email }
  });
  res.json({ ok: true });
}

module.exports = {
  me,
  updatePassword,
  updatePreferences
};
