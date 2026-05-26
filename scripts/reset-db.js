require('dotenv').config();
const { Pool } = require('pg');


const DATABASE_URL = process.env.DATABASE_URL || 'postgres://crm_user:crm_password@localhost:5432/crm_saas';

function createPoolConfig(connectionString) {
  const isLocalDatabase = /@(localhost|127\.0\.0\.1)(:|\/)/i.test(connectionString);
  const requiresSsl = !isLocalDatabase || /sslmode=require|ssl=true/i.test(connectionString);

  return {
    connectionString,
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {})
  };
}

const pool = new Pool(createPoolConfig(DATABASE_URL));

async function reset() {
  const client = await pool.connect();
  try {
    console.log('Removendo tabelas do CRM...');
    await client.query('BEGIN');
    await client.query(`
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS notification_dismissals CASCADE;
      DROP TABLE IF EXISTS crm_tasks CASCADE;
      DROP TABLE IF EXISTS client_interactions CASCADE;
      DROP TABLE IF EXISTS client_contacts CASCADE;
      DROP TABLE IF EXISTS client_companies CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS tenant_domains CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;
      DROP TABLE IF EXISTS system_settings CASCADE;
    `);
    await client.query('COMMIT');
    console.log('Banco limpo. Rode npm start para recriar tabelas e dados iniciais.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

reset();
