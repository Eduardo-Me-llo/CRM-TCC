const { ROLE_PERMISSIONS, ROLES } = require('../constants/roles');
const userModel = require('../models/user.model');
const { createAuditLog } = require('../services/audit.service');
const { assertTenantDomainAllowed, ensureCanRemoveOrChangeUser } = require('../services/user-rules.service');

async function list(req, res) {
  res.json(await userModel.listTenantUsers(req.user.tenantId));
}

async function create(req, res) {
  const { name, email, password = '123456', role = ROLES.OPERATOR, status = 'active' } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
  if (!userModel.isValidTenantRole(role)) return res.status(400).json({ message: 'Perfil inválido.' });
  if (req.user.role !== ROLES.ADMIN_MASTER && role === ROLES.ADMIN_MASTER) {
    return res.status(403).json({ message: 'Somente Admin Master pode criar outro Admin Master.' });
  }

  await assertTenantDomainAllowed(req.user.tenantId, email);
  const maxUsers = await userModel.findTenantMaxUsers(req.user.tenantId);
  const usersCount = await userModel.countTenantUsers(req.user.tenantId);
  if (usersCount >= maxUsers) return res.status(400).json({ message: 'Limite de usuários do plano atingido.' });

  const result = await userModel.createTenantUser({ tenantId: req.user.tenantId, name, email, password, role, status });
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.created', entityType: 'user', entityId: result.id, metadata: { email, role } });
  res.status(201).json(result);
}

async function update(req, res) {
  const { userId } = req.params;
  const { name, role, status } = req.body;
  const existing = await userModel.findTenantUser(userId, req.user.tenantId);
  if (!existing) return res.status(404).json({ message: 'Usuário não encontrado.' });
  if (role) {
    if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
    if (req.user.role !== ROLES.ADMIN_MASTER && role === ROLES.ADMIN_MASTER) return res.status(403).json({ message: 'Somente Admin Master pode definir Admin Master.' });
    await ensureCanRemoveOrChangeUser(userId, role);
  }

  const result = await userModel.updateTenantUser({ userId, tenantId: req.user.tenantId, name, role, status });
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.updated', entityType: 'user', entityId: userId, metadata: req.body });
  res.json(result);
}

async function remove(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ message: 'Você não pode remover o próprio usuário.' });
  const existing = await userModel.findTenantUser(userId, req.user.tenantId);
  if (!existing) return res.status(404).json({ message: 'Usuário não encontrado.' });
  await ensureCanRemoveOrChangeUser(userId);
  const result = await userModel.deleteTenantUser(userId, req.user.tenantId);
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.deleted', entityType: 'user', entityId: userId, metadata: { email: result.email } });
  res.json({ ok: true });
}

module.exports = {
  create,
  list,
  remove,
  update
};
