const { query } = require('../config/database');
const { GENERAL_ADMIN_ROLES } = require('../constants/roles');
const { getEmailDomain } = require('../utils/normalizers');

async function assertTenantDomainAllowed(tenantId, email) {
  const { rows } = await query(
    `SELECT domain, allow_external_users FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (!rows.length) throw Object.assign(new Error('Empresa contratante não encontrada.'), { status: 404 });
  const tenant = rows[0];
  if (tenant.allow_external_users) return;
  const emailDomain = getEmailDomain(email);
  if (emailDomain !== tenant.domain) {
    throw Object.assign(
      new Error(`O e-mail precisa pertencer ao domínio ${tenant.domain}.`),
      { status: 400 }
    );
  }
}

async function ensureCanRemoveOrChangeUser(userId, nextRole = null) {
  const { rows } = await query(`SELECT id, tenant_id, role FROM users WHERE id = $1`, [userId]);
  if (!rows.length) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  const user = rows[0];
  if (!user.tenant_id) return;
  if (!GENERAL_ADMIN_ROLES.includes(user.role)) return;
  if (nextRole && GENERAL_ADMIN_ROLES.includes(nextRole)) return;

  const count = await query(
    `SELECT COUNT(*)::int AS total
       FROM users
      WHERE tenant_id = $1
        AND role = ANY($2::text[])
        AND status = 'active'
        AND id <> $3`,
    [user.tenant_id, GENERAL_ADMIN_ROLES, userId]
  );
  if (count.rows[0].total < 2) {
    throw Object.assign(
      new Error('Não é possível deixar a empresa com menos de 2 administradores gerais ativos.'),
      { status: 400 }
    );
  }
}

module.exports = {
  assertTenantDomainAllowed,
  ensureCanRemoveOrChangeUser
};
