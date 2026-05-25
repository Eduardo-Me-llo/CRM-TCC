const companyModel = require('../models/company.model');
const contactModel = require('../models/contact.model');
const interactionModel = require('../models/interaction.model');
const { createAuditLog } = require('../services/audit.service');
const { sendEmail: sendEmailMessage } = require('../services/email.service');

async function list(req, res) {
  res.json(await interactionModel.list(req.user.tenantId, req.query));
}

async function create(req, res) {
  const { companyId, contactId, channel = 'email', direction = 'outbound', subject, description, outcome, nextActionAt, status = 'open', customFields = {} } = req.body;
  if (!companyId || !subject || !description) return res.status(400).json({ message: 'Empresa, assunto e descrição são obrigatórios.' });
  if (!(await companyModel.exists(req.user.tenantId, companyId))) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  if (contactId && !(await contactModel.existsForCompany(req.user.tenantId, contactId, companyId))) {
    return res.status(404).json({ message: 'Contato não encontrado para esta empresa.' });
  }
  const result = await interactionModel.create(req.user.tenantId, req.user.id, { companyId, contactId, channel, direction, subject, description, outcome, nextActionAt, status, customFields });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.created', entityType: 'client_interaction', entityId: result.id, metadata: { companyId, contactId, channel, subject } });
  res.status(201).json(result);
}

async function sendEmail(req, res) {
  const { companyId, contactId, to, subject, message } = req.body;
  if (!companyId || !to || !subject || !message) {
    return res.status(400).json({ message: 'Empresa, destinatario, assunto e mensagem sao obrigatorios.' });
  }
  if (!(await companyModel.exists(req.user.tenantId, companyId))) return res.status(404).json({ message: 'Empresa cliente nao encontrada.' });
  if (contactId && !(await contactModel.existsForCompany(req.user.tenantId, contactId, companyId))) {
    return res.status(404).json({ message: 'Contato nao encontrado para esta empresa.' });
  }

  const emailResult = await sendEmailMessage({ to, subject, text: message });
  const result = await interactionModel.create(req.user.tenantId, req.user.id, {
    companyId,
    contactId,
    channel: 'email',
    direction: 'outbound',
    subject,
    description: message,
    outcome: emailResult.delivered ? 'E-mail enviado pelo CRM.' : emailResult.message,
    status: emailResult.delivered ? 'done' : 'open',
    customFields: { emailTo: to, simulated: Boolean(emailResult.simulated) }
  });
  await createAuditLog({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: 'client_interaction.email_sent',
    entityType: 'client_interaction',
    entityId: result.id,
    metadata: { companyId, contactId, to, subject, delivered: emailResult.delivered, simulated: emailResult.simulated }
  });
  res.status(201).json({ interaction: result, email: emailResult });
}

async function update(req, res) {
  const result = await interactionModel.update(req.user.tenantId, req.params.interactionId, { ...req.body, updatedByUserId: req.user.id });
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
  sendEmail,
  update
};
