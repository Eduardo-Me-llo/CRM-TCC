const { query } = require('../config/database');
const { mapTask } = require('../mappers');

async function list(tenantId, { companyId = '', contactId = '', assignedTo = '', status = '', q = '' } = {}) {
  const result = await query(
    `SELECT t.*, c.name AS company_name, ct.name AS contact_name, au.name AS assigned_user_name, cu.name AS created_by_user_name
       FROM crm_tasks t
       LEFT JOIN client_companies c ON c.id = t.company_id AND c.tenant_id = t.tenant_id
       LEFT JOIN client_contacts ct ON ct.id = t.contact_id AND ct.tenant_id = t.tenant_id
       LEFT JOIN users au ON au.id = t.assigned_user_id
       LEFT JOIN users cu ON cu.id = t.created_by_user_id
      WHERE t.tenant_id = $1
        AND ($2 = '' OR t.company_id::text = $2)
        AND ($3 = '' OR t.contact_id::text = $3)
        AND ($4 = '' OR t.assigned_user_id::text = $4)
        AND ($5 = '' OR t.status = $5)
        AND ($6 = '' OR t.title ILIKE '%' || $6 || '%' OR t.description ILIKE '%' || $6 || '%' OR c.name ILIKE '%' || $6 || '%')
      ORDER BY
        CASE WHEN t.status = 'done' THEN 1 WHEN t.status = 'canceled' THEN 2 ELSE 0 END,
        t.due_at NULLS LAST,
        t.created_at DESC`,
    [tenantId, companyId, contactId, assignedTo, status, q]
  );
  return result.rows.map(mapTask);
}

async function create(tenantId, userId, data) {
  const result = await query(
    `INSERT INTO crm_tasks
      (tenant_id, company_id, contact_id, interaction_id, assigned_user_id, created_by_user_id, title, description, due_at, priority, status, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $11 = 'done' THEN now() ELSE NULL END)
     RETURNING *`,
    [tenantId, data.companyId || null, data.contactId || null, data.interactionId || null, data.assignedUserId || userId, userId, data.title, data.description || null, data.dueAt || null, data.priority, data.status]
  );
  return mapTask(result.rows[0]);
}

async function update(tenantId, taskId, data) {
  const result = await query(
    `UPDATE crm_tasks
        SET company_id = COALESCE($1, company_id),
            contact_id = COALESCE($2, contact_id),
            assigned_user_id = COALESCE($3, assigned_user_id),
            title = COALESCE($4, title),
            description = COALESCE($5, description),
            due_at = COALESCE($6, due_at),
            priority = COALESCE($7, priority),
            status = COALESCE($8, status),
            completed_at = CASE
              WHEN $8 = 'done' AND completed_at IS NULL THEN now()
              WHEN $8 IS NOT NULL AND $8 <> 'done' THEN NULL
              ELSE completed_at
            END,
            updated_at = now()
      WHERE id = $9 AND tenant_id = $10
      RETURNING *`,
    [data.companyId || null, data.contactId || null, data.assignedUserId || null, data.title || null, data.description || null, data.dueAt || null, data.priority || null, data.status || null, taskId, tenantId]
  );
  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

async function remove(tenantId, taskId) {
  const result = await query(`DELETE FROM crm_tasks WHERE id = $1 AND tenant_id = $2 RETURNING id, title`, [taskId, tenantId]);
  return result.rows[0] || null;
}

module.exports = {
  create,
  list,
  remove,
  update
};
