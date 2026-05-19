const { TASK_PRIORITIES, TASK_STATUSES } = require('../constants/roles');
const companyModel = require('../models/company.model');
const contactModel = require('../models/contact.model');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');
const { createAuditLog } = require('../services/audit.service');
const { normalizeEnum } = require('../utils/normalizers');

async function validateReferences(req, { companyId, contactId, assignedUserId }) {
  if (companyId && !(await companyModel.exists(req.user.tenantId, companyId))) {
    throw Object.assign(new Error('Empresa cliente não encontrada.'), { status: 404 });
  }
  if (contactId && !(await contactModel.exists(req.user.tenantId, contactId))) {
    throw Object.assign(new Error('Contato não encontrado.'), { status: 404 });
  }
  if (assignedUserId) {
    const user = await userModel.findTenantUser(assignedUserId, req.user.tenantId);
    if (!user || user.status !== 'active') {
      throw Object.assign(new Error('Responsável não encontrado.'), { status: 404 });
    }
  }
}

function normalizeTaskCreatePayload(body) {
  return {
    ...body,
    priority: normalizeEnum(body.priority || 'medium', TASK_PRIORITIES, 'medium'),
    status: normalizeEnum(body.status || 'open', TASK_STATUSES, 'open')
  };
}

function normalizeTaskUpdatePayload(body) {
  return {
    ...body,
    priority: body.priority ? normalizeEnum(body.priority, TASK_PRIORITIES, 'medium') : undefined,
    status: body.status ? normalizeEnum(body.status, TASK_STATUSES, 'open') : undefined
  };
}

async function list(req, res) {
  res.json(await taskModel.list(req.user.tenantId, req.query));
}

async function create(req, res) {
  const data = normalizeTaskCreatePayload(req.body);
  if (!data.title) return res.status(400).json({ message: 'Título da tarefa é obrigatório.' });
  await validateReferences(req, data);
  const result = await taskModel.create(req.user.tenantId, req.user.id, data);
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'task.created', entityType: 'task', entityId: result.id, metadata: { title: data.title, companyId: data.companyId, assignedUserId: data.assignedUserId } });
  res.status(201).json(result);
}

async function update(req, res) {
  const data = normalizeTaskUpdatePayload(req.body);
  await validateReferences(req, data);
  const result = await taskModel.update(req.user.tenantId, req.params.taskId, data);
  if (!result) return res.status(404).json({ message: 'Tarefa não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'task.updated', entityType: 'task', entityId: req.params.taskId, metadata: req.body });
  res.json(result);
}

async function remove(req, res) {
  const result = await taskModel.remove(req.user.tenantId, req.params.taskId);
  if (!result) return res.status(404).json({ message: 'Tarefa não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'task.deleted', entityType: 'task', entityId: req.params.taskId, metadata: { title: result.title } });
  res.json({ ok: true });
}

module.exports = {
  create,
  list,
  remove,
  update
};
