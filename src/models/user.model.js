const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { ROLE_LABELS, ROLE_PERMISSIONS, ROLES } = require('../constants/roles');
const { normalizeEmail } = require('../utils/normalizers');

async function findLoginUser(email) {
  const result = await query(
    `SELECT u.*, t.name AS tenant_name, t.domain AS tenant_domain, t.status AS tenant_status
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(u.email) = $1
      LIMIT 1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

async function findMe(userId) {
  const result = await query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.status, u.preferences,
            t.name AS tenant_name, t.domain AS tenant_domain
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function updatePreferences(userId, preferences) {
  const result = await query(
    `UPDATE users SET preferences = $1, updated_at = now() WHERE id = $2 RETURNING preferences`,
    [preferences, userId]
  );
  return result.rows[0].preferences;
}

async function listTenantUsers(tenantId) {
  const result = await query(
    `SELECT id, tenant_id, name, email, role, status, created_at, updated_at
       FROM users
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map(u => ({ ...u, roleLabel: ROLE_LABELS[u.role] }));
}

async function countTenantUsers(tenantId) {
  const result = await query(`SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1`, [tenantId]);
  return result.rows[0].total;
}

async function findTenantMaxUsers(tenantId) {
  const result = await query(`SELECT max_users FROM tenants WHERE id = $1`, [tenantId]);
  return result.rows[0]?.max_users;
}

async function createTenantUser({ tenantId, name, email, password = '123456', role = ROLES.OPERATOR, status = 'active' }) {
  const passwordHash = await bcrypt.hash(String(password), 10);
  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [tenantId, name, normalizeEmail(email), passwordHash, role, status]
  );
  return { ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] };
}

async function updateTenantUser({ userId, tenantId, name, role, status }) {
  const result = await query(
    `UPDATE users
        SET name = COALESCE($1, name),
            role = COALESCE($2, role),
            status = COALESCE($3, status),
            updated_at = now()
      WHERE id = $4 AND tenant_id = $5
      RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [name || null, role || null, status || null, userId, tenantId]
  );
  return result.rows[0] ? { ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] } : null;
}

async function findTenantUser(userId, tenantId) {
  const result = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  return result.rows[0] || null;
}

async function deleteTenantUser(userId, tenantId) {
  const result = await query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id, email`, [userId, tenantId]);
  return result.rows[0] || null;
}

function isValidTenantRole(role) {
  return role !== ROLES.DEVELOPER && Boolean(ROLE_PERMISSIONS[role]);
}

module.exports = {
  countTenantUsers,
  createTenantUser,
  deleteTenantUser,
  findLoginUser,
  findMe,
  findTenantMaxUsers,
  findTenantUser,
  isValidTenantRole,
  listTenantUsers,
  updatePreferences,
  updateTenantUser
};
