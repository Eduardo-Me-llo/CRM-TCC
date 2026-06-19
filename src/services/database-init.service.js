const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { createAuditLog } = require('./audit.service');

let databaseReadyPromise;

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

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
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
      pipeline_stage TEXT NOT NULL DEFAULT 'new',
      expected_value NUMERIC(12,2),
      expected_close_date DATE,
      lost_reason TEXT,
      source TEXT,
      owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      city TEXT,
      state TEXT,
      address TEXT,
      notes TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
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
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
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
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS custom_fields (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_required BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, entity_type, field_key)
    );

    CREATE TABLE IF NOT EXISTS crm_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID REFERENCES client_companies(id) ON DELETE CASCADE,
      contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
      interaction_id UUID REFERENCES client_interactions(id) ON DELETE SET NULL,
      assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_at TIMESTAMPTZ,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notification_dismissals (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_key TEXT NOT NULL,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, notification_key)
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

    CREATE TABLE IF NOT EXISTS login_verification_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
    CREATE INDEX IF NOT EXISTS idx_companies_tenant_id ON client_companies(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant_company ON client_contacts(tenant_id, company_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_tenant_company ON client_interactions(tenant_id, company_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON crm_tasks(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due ON crm_tasks(tenant_id, due_at);
    CREATE INDEX IF NOT EXISTS idx_notification_dismissals_tenant_user ON notification_dismissals(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant_entity ON custom_fields(tenant_id, entity_type, sort_order);
    CREATE INDEX IF NOT EXISTS idx_login_codes_user ON login_verification_codes(user_id, created_at DESC);
  `);

  await query(`
    ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new';
    ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS expected_value NUMERIC(12,2);
    ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS expected_close_date DATE;
    ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS lost_reason TEXT;
    ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  `);

  await query(`
    INSERT INTO system_settings (key, value)
    VALUES ('login_email_code_enabled', 'true'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  `);

  const usersCount = await query(`SELECT COUNT(*)::int AS total FROM users`);
  if (usersCount.rows[0].total > 0) return;

  const passwordHash = await bcrypt.hash('123456', 10);
  const tenant = await query(
    `INSERT INTO tenants (name, domain, plan, max_users, allow_external_users)
     VALUES ('Fundacao Getulio Vargas', 'fgv.br', 'enterprise', 200, false)
     RETURNING id`
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
      (tenant_id, name, trade_name, cnpj, industry, status, pipeline_stage, expected_value, expected_close_date, source, owner_user_id, city, state, address, notes, tags)
     VALUES
      ($1, 'Supermercados Guanabara', 'Mercado Guanabara', '00.000.000/0001-00', 'Varejo / Supermercado', 'active', 'won', 180000, now()::date + 30, 'Coleta de precos IBRE', $2, 'Rio de Janeiro', 'RJ', 'Rua exemplo, 100', 'Cliente usado como exemplo para coleta recorrente de precos do IBRE.', '["IBRE", "Coleta de Precos", "Varejo"]')
     RETURNING id`,
    [fgvId, ownerId]
  );
  const guanabaraId = guanabara.rows[0].id;
  const contact = await query(
    `INSERT INTO client_contacts
      (tenant_id, company_id, name, position, email, phone, whatsapp, preferred_channel, status, notes)
     VALUES
      ($1, $2, 'Carlos Almeida', 'Gerente Comercial', 'carlos.almeida@guanabara.example', '(21) 3333-0000', '(21) 99999-0000', 'whatsapp', 'active', 'Contato principal para confirmacao semanal de precos.')
     RETURNING id`,
    [fgvId, guanabaraId]
  );
  const contactId = contact.rows[0].id;

  await query(
    `INSERT INTO client_interactions
      (tenant_id, company_id, contact_id, user_id, channel, direction, subject, description, outcome, next_action_at, status)
     VALUES
      ($1, $2, $3, $4, 'whatsapp', 'outbound', 'Confirmacao de precos da semana', 'Contato realizado para validar coleta de precos de produtos da cesta basica.', 'Aguardando retorno do contato do mercado.', now() + interval '2 days', 'open'),
      ($1, $2, $3, $4, 'phone', 'outbound', 'Alinhamento de rotina de coleta', 'Ligacao para explicar a periodicidade de atualizacao dos precos e confirmar melhor horario de contato.', 'Contato preferiu receber mensagens por WhatsApp.', now() + interval '7 days', 'done')`,
    [fgvId, guanabaraId, contactId, ownerId]
  );

  await query(
    `INSERT INTO crm_tasks
      (tenant_id, company_id, contact_id, assigned_user_id, created_by_user_id, title, description, due_at, priority, status)
     VALUES
      ($1, $2, $3, $4, $4, 'Retornar confirmacao semanal de precos', 'Validar se o contato recebeu a lista de produtos da semana e registrar o retorno.', now() + interval '2 days', 'high', 'open'),
      ($1, $2, $3, $4, $4, 'Revisar rotina mensal com o cliente', 'Conferir se a cadencia de coleta ainda atende ao IBRE.', now() + interval '10 days', 'medium', 'in_progress')`,
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

function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initDatabase();
  }
  return databaseReadyPromise;
}

module.exports = {
  ensureDatabaseReady,
  initDatabase
};
