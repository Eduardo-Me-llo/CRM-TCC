const { query } = require('../config/database');

const ENTITY_TYPES = ['client_company', 'client_contact', 'client_interaction'];
const FIELD_TYPES = ['text', 'number', 'date', 'select'];

function mapField(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    options: row.options || [],
    isRequired: row.is_required,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

async function list(tenantId) {
  const result = await query(
    `SELECT *
       FROM custom_fields
      WHERE tenant_id = $1
      ORDER BY entity_type, sort_order, label`,
    [tenantId]
  );
  return result.rows.map(mapField);
}

async function create(tenantId, userId, data) {
  const fieldKey = slugify(data.fieldKey || data.label);
  const result = await query(
    `INSERT INTO custom_fields
      (tenant_id, entity_type, field_key, label, field_type, options, is_required, sort_order, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      tenantId,
      data.entityType,
      fieldKey,
      data.label,
      data.fieldType,
      JSON.stringify(data.options || []),
      Boolean(data.isRequired),
      Number(data.sortOrder || 0),
      userId
    ]
  );
  return mapField(result.rows[0]);
}

async function update(tenantId, fieldId, data) {
  const result = await query(
    `UPDATE custom_fields
        SET label = COALESCE($1, label),
            field_type = COALESCE($2, field_type),
            options = COALESCE($3, options),
            is_required = COALESCE($4, is_required),
            sort_order = COALESCE($5, sort_order),
            updated_at = now()
      WHERE id = $6 AND tenant_id = $7
      RETURNING *`,
    [
      data.label || null,
      data.fieldType || null,
      data.options == null ? null : JSON.stringify(data.options),
      data.isRequired == null ? null : Boolean(data.isRequired),
      data.sortOrder == null ? null : Number(data.sortOrder),
      fieldId,
      tenantId
    ]
  );
  return result.rows[0] ? mapField(result.rows[0]) : null;
}

async function remove(tenantId, fieldId) {
  const result = await query(
    `DELETE FROM custom_fields
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, label`,
    [fieldId, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  ENTITY_TYPES,
  FIELD_TYPES,
  create,
  list,
  remove,
  update
};
