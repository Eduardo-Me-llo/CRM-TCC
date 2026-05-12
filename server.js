require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'crm-dev-secret-change-me';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://crm_user:crm_password@localhost:5432/crm_saas';


function createPoolConfig(connectionString) {
  const isLocalDatabase = /@(localhost|127\.0\.0\.1)(:|\/)/i.test(connectionString);
  const requiresSsl = !isLocalDatabase || /sslmode=require|ssl=true/i.test(connectionString);
  const normalizedConnectionString = requiresSsl
    ? removeSslQueryParams(connectionString)
    : connectionString;

  return {
    connectionString: normalizedConnectionString,
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {})
  };
}

function removeSslQueryParams(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    return url.toString();
  } catch {
    return connectionString;
  }
}

function maskDatabaseUrl(connectionString) {
  return String(connectionString || '').replace(/:[^:@/]+@/, ':****@');
}

function printDatabaseHelp(error) {
  console.error('Falha ao iniciar banco de dados:', error.message);
  console.error('');
  console.error('O sistema precisa de um PostgreSQL ativo.');
  console.error('Caminhos possíveis:');
  console.error('1) Docker instalado: docker compose up -d');
  console.error('2) Sem permissão para Docker: use PostgreSQL em nuvem, como Neon ou Supabase, e cole a connection string no arquivo .env.');
  console.error('');
  console.error('Exemplo de .env sem Docker:');
  console.error('DATABASE_URL=postgresql://usuario:senha@host-do-banco/neondb?sslmode=require');
  console.error('');
  console.error('No Windows/PowerShell, prefira executar: npm.cmd start');
  console.error('');
  console.error('DATABASE_URL atual:', maskDatabaseUrl(DATABASE_URL));
}

const pool = new Pool(createPoolConfig(DATABASE_URL));
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ROLES = {
  DEVELOPER: 'DEVELOPER',
  ADMIN_MASTER: 'ADMIN_MASTER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR'
};

const ROLE_LABELS = {
  DEVELOPER: 'Desenvolvedor do CRM',
  ADMIN_MASTER: 'Administrador Master',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador'
};

const ROLE_PERMISSIONS = {
  DEVELOPER: [
    'developer.panel.read',
    'developer.tenants.manage',
    'developer.users.manage',
    'developer.settings.manage'
  ],
  ADMIN_MASTER: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_companies.delete',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_contacts.delete',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'client_interactions.delete',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'settings.read',
    'settings.update',
    'audit_logs.read'
  ],
  ADMIN: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_contacts.delete',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'client_interactions.delete',
    'users.read',
    'users.create',
    'users.update',
    'settings.read',
    'audit_logs.read'
  ],
  MANAGER: [
    'dashboard.read',
    'client_companies.read',
    'client_companies.create',
    'client_companies.update',
    'client_contacts.read',
    'client_contacts.create',
    'client_contacts.update',
    'client_interactions.read',
    'client_interactions.create',
    'client_interactions.update',
    'users.read',
    'settings.read'
  ],
  OPERATOR: [
    'dashboard.read',
    'client_companies.read',
    'client_contacts.read',
    'client_contacts.create',
    'client_interactions.read',
    'client_interactions.create',
    'settings.read'
  ]
};

const GENERAL_ADMIN_ROLES = [ROLES.ADMIN_MASTER, ROLES.ADMIN];

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getEmailDomain(email) {
  const normalized = normalizeEmail(email);
  const parts = normalized.split('@');
  return parts.length === 2 ? parts[1] : '';
}

function rolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = user.permissions || rolePermissions(user.role);
  return permissions.includes(permission);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token não informado.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId || null,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      permissions: rolePermissions(payload.role)
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: `Acesso negado. Permissão necessária: ${permission}` });
    }
    return next();
  };
}

function requireDeveloper(req, res, next) {
  if (req.user?.role !== ROLES.DEVELOPER) {
    return res.status(403).json({ message: 'Acesso exclusivo do desenvolvedor do CRM.' });
  }
  return next();
}

function requireTenantUser(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ message: 'Usuário não vinculado a uma empresa contratante.' });
  }
  return next();
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

function mapCompany(row) {
  return {
    id: row.id,
    name: row.name,
    tradeName: row.trade_name,
    cnpj: row.cnpj,
    industry: row.industry,
    status: row.status,
    source: row.source,
    city: row.city,
    state: row.state,
    address: row.address,
    notes: row.notes,
    tags: row.tags || [],
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    contactsCount: Number(row.contacts_count || 0),
    interactionsCount: Number(row.interactions_count || 0),
    lastInteractionAt: row.last_interaction_at,
    nextActionAt: row.next_action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContact(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    name: row.name,
    position: row.position,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    preferredChannel: row.preferred_channel,
    status: row.status,
    notes: row.notes,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInteraction(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    userId: row.user_id,
    userName: row.user_name,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    description: row.description,
    outcome: row.outcome,
    nextActionAt: row.next_action_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createAuditLog({ tenantId, userId, action, entityType, entityId, metadata }) {
  await query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId || null, userId || null, action, entityType, entityId || null, metadata || {}]
  );
}

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

async function initDatabase() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'professional',
      max_users INTEGER NOT NULL DEFAULT 50,
      allow_external_users BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tenant_domains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      domain TEXT NOT NULL UNIQUE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS client_companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trade_name TEXT,
      cnpj TEXT,
      industry TEXT,
      status TEXT NOT NULL DEFAULT 'prospect',
      source TEXT,
      owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      city TEXT,
      state TEXT,
      address TEXT,
      notes TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS client_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position TEXT,
      email TEXT,
      phone TEXT,
      whatsapp TEXT,
      preferred_channel TEXT NOT NULL DEFAULT 'email',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS client_interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
      contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'outbound',
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      outcome TEXT,
      next_action_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_companies_tenant_id ON client_companies(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant_company ON client_contacts(tenant_id, company_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_tenant_company ON client_interactions(tenant_id, company_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
  `);

  const usersCount = await query(`SELECT COUNT(*)::int AS total FROM users`);
  if (usersCount.rows[0].total > 0) return;

  const passwordHash = await bcrypt.hash('123456', 10);
  const tenant = await query(
    `INSERT INTO tenants (name, domain, plan, max_users, allow_external_users)
     VALUES ('Fundação Getulio Vargas', 'fgv.br', 'enterprise', 200, false)
     RETURNING id`,
    []
  );
  const fgvId = tenant.rows[0].id;
  await query(
    `INSERT INTO tenant_domains (tenant_id, domain, is_primary) VALUES ($1, 'fgv.br', true)`,
    [fgvId]
  );

  await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, status) VALUES
      (NULL, 'Desenvolvedor CRM', 'desenvolvedor@crm.local', $1, 'DEVELOPER', 'active'),
      ($2, 'Eduardo de Mello', 'eduardo.de.mello@fgv.br', $1, 'ADMIN_MASTER', 'active'),
      ($2, 'Marina Administradora', 'marina.admin@fgv.br', $1, 'ADMIN', 'active'),
      ($2, 'Carla Gerente', 'carla.gerente@fgv.br', $1, 'MANAGER', 'active'),
      ($2, 'Diego Operador', 'diego.operador@fgv.br', $1, 'OPERATOR', 'active')`,
    [passwordHash, fgvId]
  );

  const owner = await query(`SELECT id FROM users WHERE email = 'eduardo.de.mello@fgv.br'`);
  const ownerId = owner.rows[0].id;

  const guanabara = await query(
    `INSERT INTO client_companies
      (tenant_id, name, trade_name, cnpj, industry, status, source, owner_user_id, city, state, address, notes, tags)
     VALUES
      ($1, 'Supermercados Guanabara', 'Mercado Guanabara', '00.000.000/0001-00', 'Varejo / Supermercado', 'active', 'Coleta de preços IBRE', $2, 'Rio de Janeiro', 'RJ', 'Rua exemplo, 100', 'Cliente usado como exemplo para coleta recorrente de preços do IBRE.', '["IBRE", "Coleta de Preços", "Varejo"]')
     RETURNING id`,
    [fgvId, ownerId]
  );
  const guanabaraId = guanabara.rows[0].id;

  const contact = await query(
    `INSERT INTO client_contacts
      (tenant_id, company_id, name, position, email, phone, whatsapp, preferred_channel, status, notes)
     VALUES
      ($1, $2, 'Carlos Almeida', 'Gerente Comercial', 'carlos.almeida@guanabara.example', '(21) 3333-0000', '(21) 99999-0000', 'whatsapp', 'active', 'Contato principal para confirmação semanal de preços.')
     RETURNING id`,
    [fgvId, guanabaraId]
  );
  const contactId = contact.rows[0].id;

  await query(
    `INSERT INTO client_interactions
      (tenant_id, company_id, contact_id, user_id, channel, direction, subject, description, outcome, next_action_at, status)
     VALUES
      ($1, $2, $3, $4, 'whatsapp', 'outbound', 'Confirmação de preços da semana', 'Contato realizado para validar coleta de preços de produtos da cesta básica.', 'Aguardando retorno do contato do mercado.', now() + interval '2 days', 'open'),
      ($1, $2, $3, $4, 'phone', 'outbound', 'Alinhamento de rotina de coleta', 'Ligação para explicar a periodicidade de atualização dos preços e confirmar melhor horário de contato.', 'Contato preferiu receber mensagens por WhatsApp.', now() + interval '7 days', 'done')`,
    [fgvId, guanabaraId, contactId, ownerId]
  );

  await createAuditLog({
    tenantId: fgvId,
    userId: ownerId,
    action: 'seed.initialized',
    entityType: 'system',
    metadata: { version: '6.0.0', demoTenant: 'fgv.br' }
  });
}

// AUTH
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const result = await query(
    `SELECT u.*, t.name AS tenant_name, t.domain AS tenant_domain, t.status AS tenant_status
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(u.email) = $1
      LIMIT 1`,
    [email]
  );
  if (!result.rows.length) return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
  const user = result.rows[0];
  if (user.status !== 'active') return res.status(403).json({ message: 'Usuário inativo.' });
  if (user.tenant_id && user.tenant_status !== 'active') return res.status(403).json({ message: 'Empresa contratante inativa.' });
  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) return res.status(401).json({ message: 'E-mail ou senha inválidos.' });

  const token = jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantDomain: user.tenant_domain,
      permissions: rolePermissions(user.role),
      preferences: user.preferences || {}
    }
  });
}));

app.get('/api/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.status, u.preferences,
            t.name AS tenant_name, t.domain AS tenant_domain
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
  const user = result.rows[0];
  res.json({
    id: user.id,
    tenantId: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    status: user.status,
    tenantName: user.tenant_name,
    tenantDomain: user.tenant_domain,
    permissions: rolePermissions(user.role),
    preferences: user.preferences || {}
  });
}));

app.put('/api/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const preferences = req.body.preferences || {};
  const result = await query(
    `UPDATE users SET preferences = $1, updated_at = now() WHERE id = $2 RETURNING preferences`,
    [preferences, req.user.id]
  );
  res.json({ preferences: result.rows[0].preferences });
}));

// DEVELOPER PANEL
app.get('/api/developer/summary', requireAuth, requireDeveloper, asyncHandler(async (_req, res) => {
  const tenants = await query(`SELECT COUNT(*)::int AS total FROM tenants`);
  const users = await query(`SELECT COUNT(*)::int AS total FROM users WHERE tenant_id IS NOT NULL`);
  const companies = await query(`SELECT COUNT(*)::int AS total FROM client_companies`);
  const interactions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions`);
  res.json({
    tenants: tenants.rows[0].total,
    users: users.rows[0].total,
    clientCompanies: companies.rows[0].total,
    interactions: interactions.rows[0].total
  });
}));

app.get('/api/developer/tenants', requireAuth, requireDeveloper, asyncHandler(async (_req, res) => {
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
  res.json(result.rows.map(row => ({
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
  })));
}));

app.post('/api/developer/tenants', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const { name, domain, status = 'active', plan = 'professional', maxUsers = 50, allowExternalUsers = false } = req.body;
  if (!name || !domain) return res.status(400).json({ message: 'Nome e domínio são obrigatórios.' });
  const normalizedDomain = String(domain).trim().toLowerCase().replace(/^@/, '');
  const result = await query(
    `INSERT INTO tenants (name, domain, status, plan, max_users, allow_external_users)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, normalizedDomain, status, plan, Number(maxUsers), Boolean(allowExternalUsers)]
  );
  await query(`INSERT INTO tenant_domains (tenant_id, domain, is_primary) VALUES ($1, $2, true)`, [result.rows[0].id, normalizedDomain]);
  await createAuditLog({ userId: req.user.id, action: 'developer.tenant.created', entityType: 'tenant', entityId: result.rows[0].id, metadata: { name, domain: normalizedDomain } });
  res.status(201).json(result.rows[0]);
}));

app.put('/api/developer/tenants/:tenantId', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { name, status, plan, maxUsers, allowExternalUsers } = req.body;
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
  if (!result.rows.length) return res.status(404).json({ message: 'Empresa contratante não encontrada.' });
  await createAuditLog({ userId: req.user.id, action: 'developer.tenant.updated', entityType: 'tenant', entityId: tenantId, metadata: req.body });
  res.json(result.rows[0]);
}));

app.get('/api/developer/tenants/:tenantId/users', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, tenant_id, name, email, role, status, created_at, updated_at
       FROM users
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [req.params.tenantId]
  );
  res.json(result.rows.map(u => ({ ...u, roleLabel: ROLE_LABELS[u.role] })));
}));

app.post('/api/developer/tenants/:tenantId/users', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { name, email, password = '123456', role = ROLES.OPERATOR, status = 'active' } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
  if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
  await assertTenantDomainAllowed(tenantId, email);
  const tenant = await query(`SELECT max_users FROM tenants WHERE id = $1`, [tenantId]);
  const usersCount = await query(`SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1`, [tenantId]);
  if (usersCount.rows[0].total >= tenant.rows[0].max_users) return res.status(400).json({ message: 'Limite de usuários do plano atingido.' });
  const passwordHash = await bcrypt.hash(String(password), 10);
  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [tenantId, name, normalizeEmail(email), passwordHash, role, status]
  );
  await createAuditLog({ userId: req.user.id, tenantId, action: 'developer.user.created', entityType: 'user', entityId: result.rows[0].id, metadata: { email, role } });
  res.status(201).json({ ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] });
}));


app.put('/api/developer/users/:userId', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { name, role, status } = req.body;
  const existing = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id IS NOT NULL`, [userId]);
  if (!existing.rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
  if (role) {
    if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
    await ensureCanRemoveOrChangeUser(userId, role);
  }
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
  await createAuditLog({ userId: req.user.id, tenantId: result.rows[0].tenant_id, action: 'developer.user.updated', entityType: 'user', entityId: userId, metadata: req.body });
  res.json({ ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] });
}));

app.delete('/api/developer/users/:userId', requireAuth, requireDeveloper, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await ensureCanRemoveOrChangeUser(userId);
  const result = await query(`DELETE FROM users WHERE id = $1 RETURNING id, tenant_id, email, role`, [userId]);
  if (!result.rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
  await createAuditLog({ userId: req.user.id, tenantId: result.rows[0].tenant_id, action: 'developer.user.deleted', entityType: 'user', entityId: result.rows[0].id, metadata: { email: result.rows[0].email } });
  res.json({ ok: true });
}));

// TENANT DASHBOARD
app.get('/api/dashboard/summary', requireAuth, requireTenantUser, requirePermission('dashboard.read'), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const companies = await query(`SELECT COUNT(*)::int AS total FROM client_companies WHERE tenant_id = $1`, [tenantId]);
  const contacts = await query(`SELECT COUNT(*)::int AS total FROM client_contacts WHERE tenant_id = $1`, [tenantId]);
  const interactions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions WHERE tenant_id = $1`, [tenantId]);
  const nextActions = await query(`SELECT COUNT(*)::int AS total FROM client_interactions WHERE tenant_id = $1 AND status = 'open' AND next_action_at IS NOT NULL`, [tenantId]);
  const byStatus = await query(`SELECT status, COUNT(*)::int AS total FROM client_companies WHERE tenant_id = $1 GROUP BY status ORDER BY total DESC`, [tenantId]);
  res.json({
    companies: companies.rows[0].total,
    contacts: contacts.rows[0].total,
    interactions: interactions.rows[0].total,
    nextActions: nextActions.rows[0].total,
    companiesByStatus: byStatus.rows
  });
}));

// TENANT USERS
app.get('/api/users', requireAuth, requireTenantUser, requirePermission('users.read'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, tenant_id, name, email, role, status, created_at, updated_at
       FROM users
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [req.user.tenantId]
  );
  res.json(result.rows.map(u => ({ ...u, roleLabel: ROLE_LABELS[u.role] })));
}));

app.post('/api/users', requireAuth, requireTenantUser, requirePermission('users.create'), asyncHandler(async (req, res) => {
  const { name, email, password = '123456', role = ROLES.OPERATOR, status = 'active' } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
  if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
  if (req.user.role !== ROLES.ADMIN_MASTER && role === ROLES.ADMIN_MASTER) {
    return res.status(403).json({ message: 'Somente Admin Master pode criar outro Admin Master.' });
  }
  await assertTenantDomainAllowed(req.user.tenantId, email);
  const tenant = await query(`SELECT max_users FROM tenants WHERE id = $1`, [req.user.tenantId]);
  const usersCount = await query(`SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1`, [req.user.tenantId]);
  if (usersCount.rows[0].total >= tenant.rows[0].max_users) return res.status(400).json({ message: 'Limite de usuários do plano atingido.' });
  const passwordHash = await bcrypt.hash(String(password), 10);
  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [req.user.tenantId, name, normalizeEmail(email), passwordHash, role, status]
  );
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.created', entityType: 'user', entityId: result.rows[0].id, metadata: { email, role } });
  res.status(201).json({ ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] });
}));

app.put('/api/users/:userId', requireAuth, requireTenantUser, requirePermission('users.update'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { name, role, status } = req.body;
  const existing = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id = $2`, [userId, req.user.tenantId]);
  if (!existing.rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
  if (role) {
    if (role === ROLES.DEVELOPER || !ROLE_PERMISSIONS[role]) return res.status(400).json({ message: 'Perfil inválido.' });
    if (req.user.role !== ROLES.ADMIN_MASTER && role === ROLES.ADMIN_MASTER) return res.status(403).json({ message: 'Somente Admin Master pode definir Admin Master.' });
    await ensureCanRemoveOrChangeUser(userId, role);
  }
  const result = await query(
    `UPDATE users
        SET name = COALESCE($1, name),
            role = COALESCE($2, role),
            status = COALESCE($3, status),
            updated_at = now()
      WHERE id = $4 AND tenant_id = $5
      RETURNING id, tenant_id, name, email, role, status, created_at, updated_at`,
    [name || null, role || null, status || null, userId, req.user.tenantId]
  );
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.updated', entityType: 'user', entityId: userId, metadata: req.body });
  res.json({ ...result.rows[0], roleLabel: ROLE_LABELS[result.rows[0].role] });
}));

app.delete('/api/users/:userId', requireAuth, requireTenantUser, requirePermission('users.delete'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ message: 'Você não pode remover o próprio usuário.' });
  const existing = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id = $2`, [userId, req.user.tenantId]);
  if (!existing.rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
  await ensureCanRemoveOrChangeUser(userId);
  await query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [userId, req.user.tenantId]);
  await createAuditLog({ userId: req.user.id, tenantId: req.user.tenantId, action: 'user.deleted', entityType: 'user', entityId: userId, metadata: { email: existing.rows[0].email } });
  res.json({ ok: true });
}));

// CLIENT COMPANIES
app.get('/api/client-companies', requireAuth, requireTenantUser, requirePermission('client_companies.read'), asyncHandler(async (req, res) => {
  const { q = '', status = '', industry = '' } = req.query;
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
        AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR c.trade_name ILIKE '%' || $2 || '%' OR c.cnpj ILIKE '%' || $2 || '%' OR c.notes ILIKE '%' || $2 || '%')
        AND ($3 = '' OR c.status = $3)
        AND ($4 = '' OR c.industry ILIKE '%' || $4 || '%')
      GROUP BY c.id, u.name
      ORDER BY c.updated_at DESC`,
    [req.user.tenantId, q, status, industry]
  );
  res.json(result.rows.map(mapCompany));
}));

app.get('/api/client-companies/:companyId', requireAuth, requireTenantUser, requirePermission('client_companies.read'), asyncHandler(async (req, res) => {
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
    [req.params.companyId, req.user.tenantId]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  res.json(mapCompany(result.rows[0]));
}));

app.post('/api/client-companies', requireAuth, requireTenantUser, requirePermission('client_companies.create'), asyncHandler(async (req, res) => {
  const { name, tradeName, cnpj, industry, status = 'prospect', source, ownerUserId, city, state, address, notes, tags = [] } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome da empresa cliente é obrigatório.' });
  const result = await query(
    `INSERT INTO client_companies
      (tenant_id, name, trade_name, cnpj, industry, status, source, owner_user_id, city, state, address, notes, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [req.user.tenantId, name, tradeName || null, cnpj || null, industry || null, status, source || null, ownerUserId || req.user.id, city || null, state || null, address || null, notes || null, JSON.stringify(tags)]
  );
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.created', entityType: 'client_company', entityId: result.rows[0].id, metadata: { name } });
  res.status(201).json(mapCompany({ ...result.rows[0], contacts_count: 0, interactions_count: 0 }));
}));

app.put('/api/client-companies/:companyId', requireAuth, requireTenantUser, requirePermission('client_companies.update'), asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { name, tradeName, cnpj, industry, status, source, ownerUserId, city, state, address, notes, tags } = req.body;
  const result = await query(
    `UPDATE client_companies
        SET name = COALESCE($1, name),
            trade_name = COALESCE($2, trade_name),
            cnpj = COALESCE($3, cnpj),
            industry = COALESCE($4, industry),
            status = COALESCE($5, status),
            source = COALESCE($6, source),
            owner_user_id = COALESCE($7, owner_user_id),
            city = COALESCE($8, city),
            state = COALESCE($9, state),
            address = COALESCE($10, address),
            notes = COALESCE($11, notes),
            tags = COALESCE($12, tags),
            updated_at = now()
      WHERE id = $13 AND tenant_id = $14
      RETURNING *`,
    [name || null, tradeName || null, cnpj || null, industry || null, status || null, source || null, ownerUserId || null, city || null, state || null, address || null, notes || null, tags == null ? null : JSON.stringify(tags), companyId, req.user.tenantId]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.updated', entityType: 'client_company', entityId: companyId, metadata: req.body });
  res.json(mapCompany(result.rows[0]));
}));

app.delete('/api/client-companies/:companyId', requireAuth, requireTenantUser, requirePermission('client_companies.delete'), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM client_companies WHERE id = $1 AND tenant_id = $2 RETURNING id, name`, [req.params.companyId, req.user.tenantId]);
  if (!result.rows.length) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_company.deleted', entityType: 'client_company', entityId: req.params.companyId, metadata: { name: result.rows[0].name } });
  res.json({ ok: true });
}));

// CONTACTS
app.get('/api/client-contacts', requireAuth, requireTenantUser, requirePermission('client_contacts.read'), asyncHandler(async (req, res) => {
  const { companyId = '', q = '', status = '' } = req.query;
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
    [req.user.tenantId, companyId, q, status]
  );
  res.json(result.rows.map(mapContact));
}));

app.post('/api/client-contacts', requireAuth, requireTenantUser, requirePermission('client_contacts.create'), asyncHandler(async (req, res) => {
  const { companyId, name, position, email, phone, whatsapp, preferredChannel = 'email', status = 'active', notes } = req.body;
  if (!companyId || !name) return res.status(400).json({ message: 'Empresa cliente e nome do contato são obrigatórios.' });
  const company = await query(`SELECT id FROM client_companies WHERE id = $1 AND tenant_id = $2`, [companyId, req.user.tenantId]);
  if (!company.rows.length) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  const result = await query(
    `INSERT INTO client_contacts
      (tenant_id, company_id, name, position, email, phone, whatsapp, preferred_channel, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [req.user.tenantId, companyId, name, position || null, email || null, phone || null, whatsapp || null, preferredChannel, status, notes || null]
  );
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.created', entityType: 'client_contact', entityId: result.rows[0].id, metadata: { name, companyId } });
  res.status(201).json(mapContact(result.rows[0]));
}));

app.put('/api/client-contacts/:contactId', requireAuth, requireTenantUser, requirePermission('client_contacts.update'), asyncHandler(async (req, res) => {
  const { contactId } = req.params;
  const { name, position, email, phone, whatsapp, preferredChannel, status, notes } = req.body;
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
    [name || null, position || null, email || null, phone || null, whatsapp || null, preferredChannel || null, status || null, notes || null, contactId, req.user.tenantId]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Contato não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.updated', entityType: 'client_contact', entityId: contactId, metadata: req.body });
  res.json(mapContact(result.rows[0]));
}));

app.delete('/api/client-contacts/:contactId', requireAuth, requireTenantUser, requirePermission('client_contacts.delete'), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM client_contacts WHERE id = $1 AND tenant_id = $2 RETURNING id, name`, [req.params.contactId, req.user.tenantId]);
  if (!result.rows.length) return res.status(404).json({ message: 'Contato não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_contact.deleted', entityType: 'client_contact', entityId: req.params.contactId, metadata: { name: result.rows[0].name } });
  res.json({ ok: true });
}));

// INTERACTIONS
app.get('/api/client-interactions', requireAuth, requireTenantUser, requirePermission('client_interactions.read'), asyncHandler(async (req, res) => {
  const { companyId = '', contactId = '', status = '', channel = '', q = '' } = req.query;
  const result = await query(
    `SELECT i.*, c.name AS company_name, ct.name AS contact_name, u.name AS user_name
       FROM client_interactions i
       JOIN client_companies c ON c.id = i.company_id AND c.tenant_id = i.tenant_id
       LEFT JOIN client_contacts ct ON ct.id = i.contact_id AND ct.tenant_id = i.tenant_id
       LEFT JOIN users u ON u.id = i.user_id
      WHERE i.tenant_id = $1
        AND ($2 = '' OR i.company_id::text = $2)
        AND ($3 = '' OR i.contact_id::text = $3)
        AND ($4 = '' OR i.status = $4)
        AND ($5 = '' OR i.channel = $5)
        AND ($6 = '' OR i.subject ILIKE '%' || $6 || '%' OR i.description ILIKE '%' || $6 || '%' OR i.outcome ILIKE '%' || $6 || '%')
      ORDER BY i.created_at DESC`,
    [req.user.tenantId, companyId, contactId, status, channel, q]
  );
  res.json(result.rows.map(mapInteraction));
}));

app.post('/api/client-interactions', requireAuth, requireTenantUser, requirePermission('client_interactions.create'), asyncHandler(async (req, res) => {
  const { companyId, contactId, channel = 'email', direction = 'outbound', subject, description, outcome, nextActionAt, status = 'open' } = req.body;
  if (!companyId || !subject || !description) return res.status(400).json({ message: 'Empresa, assunto e descrição são obrigatórios.' });
  const company = await query(`SELECT id FROM client_companies WHERE id = $1 AND tenant_id = $2`, [companyId, req.user.tenantId]);
  if (!company.rows.length) return res.status(404).json({ message: 'Empresa cliente não encontrada.' });
  if (contactId) {
    const contact = await query(`SELECT id FROM client_contacts WHERE id = $1 AND company_id = $2 AND tenant_id = $3`, [contactId, companyId, req.user.tenantId]);
    if (!contact.rows.length) return res.status(404).json({ message: 'Contato não encontrado para esta empresa.' });
  }
  const result = await query(
    `INSERT INTO client_interactions
      (tenant_id, company_id, contact_id, user_id, channel, direction, subject, description, outcome, next_action_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [req.user.tenantId, companyId, contactId || null, req.user.id, channel, direction, subject, description, outcome || null, nextActionAt || null, status]
  );
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.created', entityType: 'client_interaction', entityId: result.rows[0].id, metadata: { companyId, contactId, channel, subject } });
  res.status(201).json(mapInteraction(result.rows[0]));
}));

app.put('/api/client-interactions/:interactionId', requireAuth, requireTenantUser, requirePermission('client_interactions.update'), asyncHandler(async (req, res) => {
  const { interactionId } = req.params;
  const { channel, direction, subject, description, outcome, nextActionAt, status } = req.body;
  const result = await query(
    `UPDATE client_interactions
        SET channel = COALESCE($1, channel),
            direction = COALESCE($2, direction),
            subject = COALESCE($3, subject),
            description = COALESCE($4, description),
            outcome = COALESCE($5, outcome),
            next_action_at = COALESCE($6, next_action_at),
            status = COALESCE($7, status),
            updated_at = now()
      WHERE id = $8 AND tenant_id = $9
      RETURNING *`,
    [channel || null, direction || null, subject || null, description || null, outcome || null, nextActionAt || null, status || null, interactionId, req.user.tenantId]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Relacionamento não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.updated', entityType: 'client_interaction', entityId: interactionId, metadata: req.body });
  res.json(mapInteraction(result.rows[0]));
}));

app.delete('/api/client-interactions/:interactionId', requireAuth, requireTenantUser, requirePermission('client_interactions.delete'), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM client_interactions WHERE id = $1 AND tenant_id = $2 RETURNING id, subject`, [req.params.interactionId, req.user.tenantId]);
  if (!result.rows.length) return res.status(404).json({ message: 'Relacionamento não encontrado.' });
  await createAuditLog({ tenantId: req.user.tenantId, userId: req.user.id, action: 'client_interaction.deleted', entityType: 'client_interaction', entityId: req.params.interactionId, metadata: { subject: result.rows[0].subject } });
  res.json({ ok: true });
}));

// AUDIT LOGS
app.get('/api/audit-logs', requireAuth, requireTenantUser, requirePermission('audit_logs.read'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = $1
      ORDER BY a.created_at DESC
      LIMIT 100`,
    [req.user.tenantId]
  );
  res.json(result.rows);
}));

app.get('/api/roles', requireAuth, (_req, res) => {
  res.json(Object.keys(ROLE_LABELS).map(key => ({ key, label: ROLE_LABELS[key], permissions: rolePermissions(key) })));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  res.status(status).json({ message: error.message || 'Erro interno do servidor.' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CRM SaaS v6 rodando em http://localhost:${PORT}`);
      console.log(`Banco: ${maskDatabaseUrl(DATABASE_URL)}`);
    });
  })
  .catch(error => {
    printDatabaseHelp(error);
    process.exit(1);
  });
