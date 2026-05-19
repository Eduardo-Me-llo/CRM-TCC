const companyModel = require('../models/company.model');
const contactModel = require('../models/contact.model');
const { createAuditLog } = require('../services/audit.service');

async function list(req, res) {
  res.json(await contactModel.list(req.user.tenantId, req.query));
}

async function create(req, res) {
  const { companyId, name, position, email, phone, whatsapp, preferredChannel = 'email', status = 'active', notes } = req.body;
  if (!companyId || !name) return res.status(400).json({ message: 'Empresa cliente e nome do contato são obrigatórios.' });
  if (!(await companyModel.exists(req.user.tenantId, companyId))) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  const result = await contactModel.create(req.user.tenantId, { companyId, name, position, email, phone, whatsapp, preferredChannel, status, notes });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.created', entityType: 'client_contact', entityId: result.id, metadata: { name, companyId } });
  res.status(201).json(result);
}

async function update(req, res) {
  const result = await contactModel.update(req.user.tenantId, req.params.contactId, req.body);
  if (!result) return res.status(404).json({ message: 'Contato não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.updated', entityType: 'client_contact', entityId: req.params.contactId, metadata: req.body });
  res.json(result);
}

async function remove(req, res) {
  const result = await contactModel.remove(req.user.tenantId, req.params.contactId);
  if (!result) return res.status(404).json({ message: 'Contato não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.deleted', entityType: 'client_contact', entityId: req.params.contactId, metadata: { name: result.name } });
  res.json({ ok: true });
}

module.exports = {
  create,
  list,
  remove,
  update
};
