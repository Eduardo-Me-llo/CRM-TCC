const bcrypt = require('bcryptjs');
const { ROLE_PERMISSIONS, ROLES } = require('../constants/roles');
const developerModel = require('../models/developer.model');
const systemSettingsModel = require('../models/system-settings.model');
const userModel = require('../models/user.model');
const { createAuditLog } = require('../services/audit.service');
const { assertTenantDomainAllowed, ensureCanRemoveOrChangeUser } = require('../services/user-rules.service');

async function summary(_req, res) {
  res.json(await developerModel.summary());
}

async function listTenants(_req, res) {
  res.json(await developerModel.listTenants());
}

async function createTenant(req, res) {
  const { name, domain } = req.body;
  if (!name || !domain) return res.status(400).json({ message: 'Nome e domínio são obrigatórios.' });
  const result = await developerModel.createTenant(req.body);
  await createAuditLog({ userId: req.user.id, action: 'developer.tenant.created', entityType: 'tenant', entityId: result.id, metadata: { name, domain: result.domain } });
  res.status(201).json(result);
}

async function updateTenant(req, res) {
  const result = await developerModel.updateTenant({ tenantId: req.params.tenantId, ...req.body });
  if (!result) return res.status(404).json({ message: 'Empresa contratante não encontrada.' });
  await createAuditLog({ userId: req.user.id, action: 'developer.tenant.updated', entityType: 'tenant', entityId: req.params.tenantId, metadata: req.body });
  res.json(result);
}

async function listUsers(req, res) {
  res.json(await developerModel.listUsersByTenant(req.params.tenantId));
}

async function createUser(req, res) {
  const { tenantId } = req.params;
  const { name, email, password = '123456', role = ROLES.OPERATOR, status = 'active' } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
  if (!userModel.isValidTenantRole(role)) return res.status(400).json({ message: 'Perfil inválido.' });
  await assertTenantDomainAllowed(tenantId, email);
  const maxUsers = await userModel.findTenantMaxUsers(tenantId);
  const usersCount = await userModel.countTenantUsers(tenantId);
  if (usersCount >= maxUsers) return res.status(400).json({ message: 'Limite de usuários do plano atingido.' });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const result = await developerModel.createUser({ tenantId, name, email, passwordHash, role, status });
  await createAuditLog({ userId: req.user.id, tenantId, action: 'developer.user.created', entityType: 'user', entityId: result.id, metadata: { email, role } });
  res.status(201).json(result);
}

async function updateUser(req, res) {
  const { userId } = req.params;
  const { role } = req.body;
  const existing = await developerModel.findManagedUser(userId);
  if (!existing) return res.status(404).json({ message: 'Usuário não encontrado.' });
  if (role) {
    if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
    await ensureCanRemoveOrChangeUser(userId, role);
  }
  const result = await developerModel.updateUser({ userId, ...req.body });
  await createAuditLog({ userId: req.user.id, tenantId: result.tenant_id, action: 'developer.user.updated', entityType: 'user', entityId: userId, metadata: req.body });
  res.json(result);
}

async function removeUser(req, res) {
  const { userId } = req.params;
  await ensureCanRemoveOrChangeUser(userId);
  const result = await developerModel.deleteManagedUser(userId);
  if (!result) return res.status(404).json({ message: 'Usuário não encontrado.' });
  await createAuditLog({ userId: req.user.id, tenantId: result.tenant_id, action: 'developer.user.deleted', entityType: 'user', entityId: result.id, metadata: { email: result.email } });
  res.json({ ok: true });
}

async function getSettings(_req, res) {
  res.json(await systemSettingsModel.getDeveloperSettings());
}

async function updateSettings(req, res) {
  const result = await systemSettingsModel.updateDeveloperSettings(req.body || {});
  await createAuditLog({ userId: req.user.id, action: 'developer.settings.updated', entityType: 'system_settings', metadata: result });
  res.json(result);
}

module.exports = {
  createTenant,
  createUser,
  getSettings,
  listTenants,
  listUsers,
  removeUser,
  summary,
  updateSettings,
  updateTenant,
  updateUser
};
