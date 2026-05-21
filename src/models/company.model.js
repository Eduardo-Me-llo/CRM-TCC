const { query } = require('../config/database');
const { mapCompany } = require('../mappers');

async function list(tenantId, { q = '', status = '', industry = '', pipelineStage = '' } = {}) {
  const result = await query(
    `SELECT c.*,
            u.name AS owner_name,
            COUNT(DISTINCT ct.id)::int AS contacts_count,
            COUNT(DISTINCT i.id)::int AS interactions_count,
            MAX(i.created_at) AS last_interaction_at,
            MIN(i.next_action_at) FILTER (WHERE i.status = 'open' AND i.next_action_at IS NOT NULL) AS next_action_at
       FROM client_companies c
       LEFT JOIN users u ON u.id = c.owner_user_id
       LEFT JOIN client_contacts ct ON ct.company_id = c.id
       LEFT JOIN client_interactions i ON i.company_id = c.id
      WHERE c.tenant_id = $1
        AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.trade_name ILIKE '%' || $2 || '%' OR c.cnpj ILIKE '%' || $2 || '%' OR c.notes ILIKE '%' || $2 || '%' OR c.custom_fields::text ILIKE '%' || $2 || '%')
        AND ($3 = '' OR c.status = $3)
        AND ($4 = '' OR c.industry ILIKE '%' || $4 || '%')
        AND ($5 = '' OR c.pipeline_stage = $5)
      GROUP BY c.id, u.name
      ORDER BY c.updated_at DESC`,
    [tenantId, q, status, industry, pipelineStage]
  );
  return result.rows.map(mapCompany);
}

async function listForExport(tenantId) {
  const result = await query(
    `SELECT c.*, u.name AS owner_name
       FROM client_companies c
       LEFT JOIN users u ON u.id = c.owner_user_id
      WHERE c.tenant_id = $1
      ORDER BY c.name`,
    [tenantId]
  );
  return result.rows;
}

async function findById(tenantId, companyId) {
  const result = await query(
    `SELECT c.*, u.name AS owner_name,
            COUNT(DISTINCT ct.id)::int AS contacts_count,
            COUNT(DISTINCT i.id)::int AS interactions_count,
            MAX(i.created_at) AS last_interaction_at,
            MIN(i.next_action_at) FILTER (WHERE i.status = 'open' AND i.next_action_at IS NOT NULL) AS next_action_at
       FROM client_companies c
       LEFT JOIN users u ON u.id = c.owner_user_id
       LEFT JOIN client_contacts ct ON ct.company_id = c.id
       LEFT JOIN client_interactions i ON i.company_id = c.id
      WHERE c.id = $1 AND c.tenant_id = $2
      GROUP BY c.id, u.name`,
    [companyId, tenantId]
  );
  return result.rows[0] ? mapCompany(result.rows[0]) : null;
}

async function exists(tenantId, companyId) {
  const result = await query(`SELECT id FROM client_companies WHERE id = $1 AND tenant_id = $2`, [companyId, tenantId]);
  return Boolean(result.rows.length);
}

async function create(tenantId, userId, data) {
  const result = await query(
    `INSERT INTO client_companies
      (tenant_id, name, trade_name, cnpj, industry, status, pipeline_stage, expected_value, expected_close_date, lost_reason, source, owner_user_id, city, state, address, notes, tags, custom_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [tenantId, data.name, data.tradeName || null, data.cnpj || null, data.industry || null, data.status, data.pipelineStage, data.expectedValue, data.expectedCloseDate || null, data.lostReason || null, data.source || null, data.ownerUserId || userId, data.city || null, data.state || null, data.address || null, data.notes || null, JSON.stringify(data.tags || []), JSON.stringify(data.customFields || {})]
  );
  return mapCompany({ ...result.rows[0], contacts_count: 0, interactions_count: 0 });
}

async function createImported(tenantId, userId, data) {
  await query(
    `INSERT INTO client_companies
      (tenant_id, name, trade_name, cnpj, industry, status, pipeline_stage, expected_value, expected_close_date, source, owner_user_id, city, state, address, notes, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [tenantId, data.name, data.tradeName || null, data.cnpj || null, data.industry || null, data.status, data.pipelineStage, data.expectedValue, data.expectedCloseDate || null, data.source || null, userId, data.city || null, data.state || null, data.address || null, data.notes || null, JSON.stringify(data.tags || [])]
  );
}

async function update(tenantId, companyId, data) {
  const result = await query(
    `UPDATE client_companies
        SET name = COALESCE($1, name),
            trade_name = COALESCE($2, trade_name),
            cnpj = COALESCE($3, cnpj),
            industry = COALESCE($4, industry),
            status = COALESCE($5, status),
            pipeline_stage = COALESCE($6, pipeline_stage),
            expected_value = COALESCE($7, expected_value),
            expected_close_date = COALESCE($8, expected_close_date),
            lost_reason = COALESCE($9, lost_reason),
            source = COALESCE($10, source),
            owner_user_id = COALESCE($11, owner_user_id),
            city = COALESCE($12, city),
            state = COALESCE($13, state),
            address = COALESCE($14, address),
            notes = COALESCE($15, notes),
            tags = COALESCE($16, tags),
            custom_fields = COALESCE($17, custom_fields),
            updated_at = now()
      WHERE id = $18 AND tenant_id = $19
      RETURNING *`,
    [data.name || null, data.tradeName || null, data.cnpj || null, data.industry || null, data.status || null, data.pipelineStage || null, data.expectedValue === undefined ? null : data.expectedValue, data.expectedCloseDate || null, data.lostReason || null, data.source || null, data.ownerUserId || null, data.city || null, data.state || null, data.address || null, data.notes || null, data.tags == null ? null : JSON.stringify(data.tags), data.customFields == null ? null : JSON.stringify(data.customFields), companyId, tenantId]
  );
  return result.rows[0] ? mapCompany(result.rows[0]) : null;
}

async function remove(tenantId, companyId) {
  const result = await query(`DELETE FROM client_companies WHERE id = $1 AND tenant_id = $2 RETURNING id, name`, [companyId, tenantId]);
  return result.rows[0] || null;
}

module.exports = {
  create,
  createImported,
  exists,
  findById,
  list,
  listForExport,
  remove,
  update
};
