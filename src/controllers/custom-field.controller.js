const customFieldModel = require('../models/custom-field.model');
const { createAuditLog } = require('../services/audit.service');
const { isUuid } = require('../utils/http');

function normalizeOptions(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function normalizePayload(body) {
  return {
    entityType: body.entityType,
    fieldKey: body.fieldKey,
    label: String(body.label || '').trim(),
    fieldType: body.fieldType || 'text',
    options: normalizeOptions(body.options),
    isRequired: Boolean(body.isRequired),
    sortOrder: Number(body.sortOrder || 0)
  };
}

async function list(req, res) {
  res.json(await customFieldModel.list(req.user.tenantId));
}

async function create(req, res) {
  const data = normalizePayload(req.body);
  if (!customFieldModel.ENTITY_TYPES.includes(data.entityType)) {
    return res.status(400).json({ message: 'Tabela customizavel invalida.' });
  }
  if (!customFieldModel.FIELD_TYPES.includes(data.fieldType)) {
    return res.status(400).json({ message: 'Tipo de campo invalido.' });
  }
  if (!data.label) return res.status(400).json({ message: 'Nome do campo e obrigatorio.' });

  const result = await customFieldModel.create(req.user.tenantId, req.user.id, data);
  await createAuditLog({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: 'custom_field.created',
    entityType: 'custom_field',
    entityId: result.id,
    metadata: result
  });
  res.status(201).json(result);
}

async function update(req, res) {
  if (!isUuid(req.params.fieldId)) return res.status(400).json({ message: 'ID do campo invalido.' });
  const data = normalizePayload(req.body);
  if (data.fieldType && !customFieldModel.FIELD_TYPES.includes(data.fieldType)) {
    return res.status(400).json({ message: 'Tipo de campo invalido.' });
  }
  const result = await customFieldModel.update(req.user.tenantId, req.params.fieldId, data);
  if (!result) return res.status(404).json({ message: 'Campo customizado nao encontrado.' });
  await createAuditLog({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: 'custom_field.updated',
    entityType: 'custom_field',
    entityId: req.params.fieldId,
    metadata: req.body
  });
  res.json(result);
}

async function remove(req, res) {
  if (!isUuid(req.params.fieldId)) return res.status(400).json({ message: 'ID do campo invalido.' });
  const result = await customFieldModel.remove(req.user.tenantId, req.params.fieldId);
  if (!result) return res.status(404).json({ message: 'Campo customizado nao encontrado.' });
  await createAuditLog({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    action: 'custom_field.deleted',
    entityType: 'custom_field',
    entityId: req.params.fieldId,
    metadata: { label: result.label }
  });
  res.json({ ok: true });
}

module.exports = {
  create,
  list,
  remove,
  update
};
