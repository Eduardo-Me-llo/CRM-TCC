const { query } = require('../config/database');
const { mapInteraction } = require('../mappers');

async function list(tenantId, { companyId = '', contactId = '', status = '', channel = '', q = '' } = {}) {
  const result = await query(
    `SELECT i.*, c.name AS company_name, ct.name AS contact_name, u.name AS user_name, ub.name AS updated_by_user_name
       FROM client_interactions i
       JOIN client_companies c ON c.id = i.company_id AND c.tenant_id = i.tenant_id
       LEFT JOIN client_contacts ct ON ct.id = i.contact_id AND ct.tenant_id = i.tenant_id
       LEFT JOIN users u ON u.id = i.user_id
       LEFT JOIN users ub ON ub.id = i.updated_by_user_id
      WHERE i.tenant_id = $1
        AND ($2 = '' OR i.company_id::text = $2)
        AND ($3 = '' OR i.contact_id::text = $3)
        AND ($4 = '' OR i.status = $4)
        AND ($5 = '' OR i.channel = $5)
        AND ($6 = '' OR i.subject ILIKE '%' || $6 || '%' OR i.description ILIKE '%' || $6 || '%' OR i.outcome ILIKE '%' || $6 || '%' OR i.custom_fields::text ILIKE '%' || $6 || '%')
      ORDER BY i.created_at DESC`,
    [tenantId, companyId, contactId, status, channel, q]
  );
  return result.rows.map(mapInteraction);
}

async function create(tenantId, userId, data) {
  const result = await query(
    `INSERT INTO client_interactions
      (tenant_id, company_id, contact_id, user_id, channel, direction, subject, description, outcome, next_action_at, status, custom_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [tenantId, data.companyId, data.contactId || null, userId, data.channel, data.direction, data.subject, data.description, data.outcome || null, data.nextActionAt || null, data.status, JSON.stringify(data.customFields || {})]
  );
  return mapInteraction(result.rows[0]);
}

async function update(tenantId, interactionId, data) {
  const result = await query(
    `UPDATE client_interactions
        SET channel = COALESCE($1, channel),
            direction = COALESCE($2, direction),
            subject = COALESCE($3, subject),
            description = COALESCE($4, description),
            outcome = COALESCE($5, outcome),
            next_action_at = COALESCE($6, next_action_at),
            status = COALESCE($7, status),
            custom_fields = COALESCE($8, custom_fields),
            updated_by_user_id = COALESCE($9, updated_by_user_id),
            updated_at = now()
      WHERE id = $10 AND tenant_id = $11
      RETURNING *`,
    [data.channel || null, data.direction || null, data.subject || null, data.description || null, data.outcome || null, data.nextActionAt || null, data.status || null, data.customFields == null ? null : JSON.stringify(data.customFields), data.updatedByUserId || null, interactionId, tenantId]
  );
  return result.rows[0] ? mapInteraction(result.rows[0]) : null;
}

async function remove(tenantId, interactionId) {
  const result = await query(`DELETE FROM client_interactions WHERE id = $1 AND tenant_id = $2 RETURNING id, subject`, [interactionId, tenantId]);
  return result.rows[0] || null;
}

module.exports = {
  create,
  list,
  remove,
  update
};
