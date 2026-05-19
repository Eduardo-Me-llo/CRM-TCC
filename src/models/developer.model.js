const { query } = require('../config/database');
const { ROLE_LABELS } = require('../constants/roles');
const { normalizeEmail } = require('../utils/normalizers');

async function summary() {
  const tenants = await query(`SELECT COUNT(*)::int AS total FROM tenants`);
  const users = await query(`SELECT COUNT(*)::int AS total FROM users WHERE tenant_id IS NOT NULL`);
  const companies = await query(`SELECT COUNT(*)::int AS total FROM client_companies`);
  const interactions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions`);
  return {
    tenants: tenants.rows[0].total,
    users: users.rows[0].total,
    clientCompanies: companies.rows[0].total,
    interactions: interactions.rows[0].total
  };
}

async function listTenants() {
  const result = await query(
    `SELECT t.*,
            COUNT(DISTINCT u.id)::int AS users_count,
            COUNT(DISTINCT c.id)::int AS client_companies_count
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id
       LEFT JOIN client_companies c ON c.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC`
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    status: row.status,
    plan: row.plan,
    maxUsers: row.max_users,
    allowExternalUsers: row.allow_external_users,
    usersCount: row.users_count,
    clientCompaniesCount: row.client_companies_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function createTenant({ name, domain, status = 'active', plan = 'professional', maxUsers = 50, allowExternalUsers = false }) {
  const normalizedDomain = String(domain).trim().toLowerCase().replace(/^@/, '');
  const result = await query(
    `INSERT INTO tenants (name, domain, status, plan, max_users, allow_external_users)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, normalizedDomain, status, plan, Number(maxUsers), Boolean(allowExternalUsers)]
  );
  await query(`INSERT INTO tenant_domains (tenant_id, domain, is_primary) VALUES ($1, $2, true)`, [result.rows[0].id, normalizedDomain]);
  return result.rows[0];
}

async function updateTenant({ tenantId, name, status, plan, maxUsers, allowExternalUsers }) {
  const result = await query(
    `UPDATE tenants
        SET name = COALESCE($1, name),
            status = COALESCE($2, status),
            plan = COALESCE($3, plan),
            max_users = COALESCE($4, max_users),
            allow_external_users = COALESCE($5, allow_external_users),
            updated_at = now()
      WHERE id = $6
      RETURNING *`,
    [name || null, status || null, plan || null, maxUsers == null ? null : Number(maxUsers), allowExternalUsers == null ? null : Boolean(allowExternalUsers), tenantId]
  );
  return result.rows[0] || null;
}

async function listUsersByTenant(tenantId) {
  const result = await query(
    `SELECT id, tenant_id, name, email, role, status, created_at, updated_at
       FROM users
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map(u => ({ ...u, roleLabel: ROLE_LABELS[u.role] }));
}

async function updateUser({ userId, name, role, status }) {
  const result = await query(
    `UPDATE users
        SET name = COALESCE($1, name),
            role = COALESCE($2, role),
            status = COALESCE($3, status),
            updated_at = now()
      WHERE id = $4 AND tenant_id IS NOT NULL
      RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [name || null, role || null, status || null, userId]
  );
  return result.rows[0] ? { ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] } : null;
}

async function findManagedUser(userId) {
  const result = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id IS NOT NULL`, [userId]);
  return result.rows[0] || null;
}

async function deleteManagedUser(userId) {
  const result = await query(`DELETE FROM users WHERE id = $1 RETURNING id, tenant_id, email, role`, [userId]);
  return result.rows[0] || null;
}

async function createUser({ tenantId, name, email, passwordHash, role, status }) {
  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [tenantId, name, normalizeEmail(email), passwordHash, role, status]
  );
  return { ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] };
}

module.exports = {
  createTenant,
  createUser,
  deleteManagedUser,
  findManagedUser,
  listTenants,
  listUsersByTenant,
  summary,
  updateTenant,
  updateUser
};
