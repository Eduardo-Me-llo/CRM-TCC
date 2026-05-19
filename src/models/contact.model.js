const { query } = require('../config/database');
const { mapContact } = require('../mappers');

async function list(tenantId, { companyId = '', q = '', status = '' } = {}) {
  const result = await query(
    `SELECT ct.*, c.name AS company_name, MAX(i.created_at) AS last_interaction_at
       FROM client_contacts ct
       JOIN client_companies c ON c.id = ct.company_id AND c.tenant_id = ct.tenant_id
       LEFT JOIN client_interactions i ON i.contact_id = ct.id
      WHERE ct.tenant_id = $1
        AND ($2 = '' OR ct.company_id::text = $2)
        AND ($3 = '' OR ct.name ILIKE '%' || $3 || '%' OR ct.email ILIKE '%' || $3 || '%' OR ct.phone ILIKE '%' || $3 || '%' OR ct.whatsapp ILIKE '%' || $3 || '%')
        AND ($4 = '' OR ct.status = $4)
      GROUP BY ct.id, c.name
      ORDER BY ct.updated_at DESC`,
    [tenantId, companyId, q, status]
  );
  return result.rows.map(mapContact);
}

async function exists(tenantId, contactId) {
  const result = await query(`SELECT id FROM client_contacts WHERE id = $1 AND tenant_id = $2`, [contactId, tenantId]);
  return Boolean(result.rows.length);
}

async function existsForCompany(tenantId, contactId, companyId) {
  const result = await query(`SELECT id FROM client_contacts WHERE id = $1 AND company_id = $2 AND tenant_id = $3`, [contactId, companyId, tenantId]);
  return Boolean(result.rows.length);
}

async function create(tenantId, data) {
  const result = await query(
    `INSERT INTO client_contacts
      (tenant_id, company_id, name, position, email, phone, whatsapp, preferred_channel, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [tenantId, data.companyId, data.name, data.position || null, data.email || null, data.phone || null, data.whatsapp || null, data.preferredChannel, data.status, data.notes || null]
  );
  return mapContact(result.rows[0]);
}

async function update(tenantId, contactId, data) {
  const result = await query(
    `UPDATE client_contacts
        SET name = COALESCE($1, name),
            position = COALESCE($2, position),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            whatsapp = COALESCE($5, whatsapp),
            preferred_channel = COALESCE($6, preferred_channel),
            status = COALESCE($7, status),
            notes = COALESCE($8, notes),
            updated_at = now()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *`,
    [data.name || null, data.position || null, data.email || null, data.phone || null, data.whatsapp || null, data.preferredChannel || null, data.status || null, data.notes || null, contactId, tenantId]
  );
  return result.rows[0] ? mapContact(result.rows[0]) : null;
}

async function remove(tenantId, contactId) {
  const result = await query(`DELETE FROM client_contacts WHERE id = $1 AND tenant_id = $2 RETURNING id, name`, [contactId, tenantId]);
  return result.rows[0] || null;
}

module.exports = {
  create,
  exists,
  existsForCompany,
  list,
  remove,
  update
};
