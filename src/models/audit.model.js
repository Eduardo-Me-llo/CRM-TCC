const { query } = require('../config/database');

async function list(tenantId) {
  const result = await query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = $1
      ORDER BY a.created_at DESC
      LIMIT 100`,
    [tenantId]
  );
  return result.rows;
}

module.exports = { list };
