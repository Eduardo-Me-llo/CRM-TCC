const { query } = require('../config/database');

async function createAuditLog({ tenantId, userId, action, entityType, entityId, metadata }) {
  await query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId || null, userId || null, action, entityType, entityId || null, metadata || {}]
  );
}

module.exports = {
  createAuditLog
};
