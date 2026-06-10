const { PIPELINE_STAGES } = require('../constants/roles');
const companyModel = require('../models/company.model');
const { createAuditLog } = require('../services/audit.service');
const { toCsv } = require('../services/csv.service');
const { isUuid } = require('../utils/http');
const { normalizeEnum, parseMoney, validateCNPJ } = require('../utils/normalizers');

function normalizeCompanyCreatePayload(body) {
  return {
    ...body,
    status: body.status || 'prospect',
    pipelineStage: normalizeEnum(body.pipelineStage || 'new', PIPELINE_STAGES, 'new'),
    expectedValue: parseMoney(body.expectedValue),
    tags: Array.isArray(body.tags) ? body.tags : [],
    customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {}
  };
}

function normalizeCompanyUpdatePayload(body) {
  return {
    ...body,
    pipelineStage: body.pipelineStage ? normalizeEnum(body.pipelineStage, PIPELINE_STAGES, 'new') : undefined,
    expectedValue: body.expectedValue === undefined ? undefined : parseMoney(body.expectedValue),
    tags: Array.isArray(body.tags) ? body.tags : undefined,
    customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : undefined
  };
}

async function list(req, res) {
  res.json(await companyModel.list(req.user.tenantId, req.query));
}

async function exportCsv(req, res) {
  const rows = (await companyModel.listForExport(req.user.tenantId)).map(row => ({
    name: row.name,
    tradeName: row.trade_name,
    cnpj: row.cnpj,
    industry: row.industry,
    status: row.status,
    pipelineStage: row.pipeline_stage,
    expectedValue: row.expected_value,
    expectedCloseDate: row.expected_close_date,
    source: row.source,
    ownerName: row.owner_name,
    city: row.city,
    state: row.state,
    address: row.address,
    notes: row.notes,
    tags: (row.tags || []).join(', ')
  }));
  const csv = toCsv(rows, [
    { key: 'name', label: 'Nome' },
    { key: 'tradeName', label: 'Nome Fantasia' },
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'industry', label: 'Ramo' },
    { key: 'status', label: 'Status' },
    { key: 'pipelineStage', label: 'Etapa do Funil' },
    { key: 'expectedValue', label: 'Valor Estimado' },
    { key: 'expectedCloseDate', label: 'Previsão de Fechamento' },
    { key: 'source', label: 'Origem' },
    { key: 'ownerName', label: 'Responsável' },
    { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'Estado' },
    { key: 'address', label: 'Endereço' },
    { key: 'notes', label: 'Observações' },
    { key: 'tags', label: 'Tags' }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="empresas-clientes.csv"');
  res.send(`\uFEFF${csv}`);
}



async function get(req, res) {
  if (!isUuid(req.params.companyId)) return res.status(400).json({ message: 'ID da empresa cliente inválido.' });
  const result = await companyModel.findById(req.user.tenantId, req.params.companyId);
  if (!result) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  res.json(result);
}

async function create(req, res) {
  const data = normalizeCompanyCreatePayload(req.body);
  if (!data.name) return res.status(400).json({ message: 'Nome da empresa cliente é obrigatório.' });
  if (!data.ownerUserId) return res.status(400).json({ message: 'Responsável interno é obrigatório.' });
  if (!data.cnpj || !validateCNPJ(data.cnpj)) return res.status(400).json({ message: 'CNPJ inválido.' });
  const result = await companyModel.create(req.user.tenantId, req.user.id, data);
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.created', entityType: 'client_company', entityId: result.id, metadata: { name: data.name, pipelineStage: data.pipelineStage } });
  res.status(201).json(result);
}

async function update(req, res) {
  const { companyId } = req.params;
  if (!isUuid(companyId)) return res.status(400).json({ message: 'ID da empresa cliente inválido.' });
  const data = normalizeCompanyUpdatePayload(req.body);
  if (data.cnpj !== undefined && data.cnpj !== '' && !validateCNPJ(data.cnpj)) {
    return res.status(400).json({ message: 'CNPJ inválido.' });
  }
  const result = await companyModel.update(req.user.tenantId, companyId, data);
  if (!result) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.updated', entityType: 'client_company', entityId: companyId, metadata: req.body });
  res.json(result);
}

async function remove(req, res) {
  if (!isUuid(req.params.companyId)) return res.status(400).json({ message: 'ID da empresa cliente inválido.' });
  const result = await companyModel.remove(req.user.tenantId, req.params.companyId);
  if (!result) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.deleted', entityType: 'client_company', entityId: req.params.companyId, metadata: { name: result.name } });
  res.json({ ok: true });
}

module.exports = {
  create,
  exportCsv,
  get,
  list,
  remove,
  update
};
