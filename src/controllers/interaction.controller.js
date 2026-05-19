const companyModel = require('../models/company.model');
const contactModel = require('../models/contact.model');
const interactionModel = require('../models/interaction.model');
const { createAuditLog } = require('../services/audit.service');

async function list(req, res) {
  res.json(await interactionModel.list(req.user.tenantId, req.query));
}

async function create(req, res) {
  const { companyId, contactId, channel = 'email', direction = 'outbound', subject, description, outcome, nextActionAt, status = 'open' } = req.body;
  if (!companyId || !subject || !description) return res.status(400).json({ message: 'Empresa, assunto e descrição são obrigatórios.' });
  if (!(await companyModel.exists(req.user.tenantId, companyId))) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  if (contactId && !(await contactModel.existsForCompany(req.user.tenantId, contactId, companyId))) {
    return res.status(404).json({ message: 'Contato não encontrado para esta empresa.' });
  }
  const result = await interactionModel.create(req.user.tenantId, req.user.id, { companyId, contactId, channel, direction, subject, description, outcome, nextActionAt, status });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.created', entityType: 'client_interaction', entityId: result.id, metadata: { companyId, contactId, channel, subject } });
  res.status(201).json(result);
}

async function update(req, res) {
  const result = await interactionModel.update(req.user.tenantId, req.params.interactionId, req.body);
  if (!result) return res.status(404).json({ message: 'Relacionamento não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.updated', entityType: 'client_interaction', entityId: req.params.interactionId, metadata: req.body });
  res.json(result);
}

async function remove(req, res) {
  const result = await interactionModel.remove(req.user.tenantId, req.params.interactionId);
  if (!result) return res.status(404).json({ message: 'Relacionamento não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.deleted', entityType: 'client_interaction', entityId: req.params.interactionId, metadata: { subject: result.subject } });
  res.json({ ok: true });
}

module.exports = {
  create,
  list,
  remove,
  update
};
