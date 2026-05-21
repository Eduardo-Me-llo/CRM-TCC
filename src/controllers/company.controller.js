const { PIPELINE_STAGES } = require('../constants/roles');
const companyModel = require('../models/company.model');
const { createAuditLog } = require('../services/audit.service');
const { csvField, parseCsv, toCsv } = require('../services/csv.service');
const { isUuid } = require('../utils/http');
const { normalizeEnum, parseMoney, parseTags } = require('../utils/normalizers');

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
    { key: 'name', label: 'name' },
    { key: 'tradeName', label: 'tradeName' },
    { key: 'cnpj', label: 'cnpj' },
    { key: 'industry', label: 'industry' },
    { key: 'status', label: 'status' },
    { key: 'pipelineStage', label: 'pipelineStage' },
    { key: 'expectedValue', label: 'expectedValue' },
    { key: 'expectedCloseDate', label: 'expectedCloseDate' },
    { key: 'source', label: 'source' },
    { key: 'ownerName', label: 'ownerName' },
    { key: 'city', label: 'city' },
    { key: 'state', label: 'state' },
    { key: 'address', label: 'address' },
    { key: 'notes', label: 'notes' },
    { key: 'tags', label: 'tags' }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="empresas-clientes.csv"');
  res.send(`\uFEFF${csv}`);
}

async function importCsv(req, res) {
  const rows = parseCsv(req.body.csv || '');
  if (!rows.length) return res.status(400).json({ message: 'CSV vazio ou sem linhas de dados.' });
  const summary = { imported: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    const name = csvField(row, ['name', 'Nome', 'nome', 'empresa']);
    if (!name) {
      summary.skipped += 1;
      summary.errors.push({ line: index + 2, message: 'Nome da empresa não informado.' });
      continue;
    }
    const status = normalizeEnum(csvField(row, ['status', 'Status']) || 'prospect', ['active', 'inactive', 'prospect', 'former', 'paused'], 'prospect');
    const pipelineStage = normalizeEnum(csvField(row, ['pipelineStage', 'etapa', 'Etapa']) || 'new', PIPELINE_STAGES, 'new');
    try {
      await companyModel.createImported(req.user.tenantId, req.user.id, {
        name,
        tradeName: csvField(row, ['tradeName', 'nomeFantasia', 'Nome fantasia']),
        cnpj: csvField(row, ['cnpj', 'CNPJ']),
        industry: csvField(row, ['industry', 'ramo', 'Ramo']),
        status,
        pipelineStage,
        expectedValue: parseMoney(csvField(row, ['expectedValue', 'valor', 'Valor'])),
        expectedCloseDate: csvField(row, ['expectedCloseDate', 'previsaoFechamento']),
        source: csvField(row, ['source', 'origem', 'Origem']),
        city: csvField(row, ['city', 'cidade', 'Cidade']),
        state: csvField(row, ['state', 'estado', 'UF']),
        address: csvField(row, ['address', 'endereco', 'Endereço']),
        notes: csvField(row, ['notes', 'observacoes', 'Observações']),
        tags: parseTags(csvField(row, ['tags', 'Tags', 'etiquetas']))
      });
      summary.imported += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({ line: index + 2, message: error.message });
    }
  }

  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.imported', entityType: 'client_company', metadata: summary });
  res.status(201).json(summary);
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
  const result = await companyModel.create(req.user.tenantId, req.user.id, data);
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.created', entityType: 'client_company', entityId: result.id, metadata: { name: data.name, pipelineStage: data.pipelineStage } });
  res.status(201).json(result);
}

async function update(req, res) {
  const { companyId } = req.params;
  if (!isUuid(companyId)) return res.status(400).json({ message: 'ID da empresa cliente inválido.' });
  const data = normalizeCompanyUpdatePayload(req.body);
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
  importCsv,
  list,
  remove,
  update
};
