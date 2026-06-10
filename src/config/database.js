const { Pool } = require('pg');
const { DATABASE_URL, isProductionRuntime } = require('./env');

let pool;

function isLocalDatabaseUrl(connectionString) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/i.test(connectionString);
}

function validateDatabaseUrl() {
  if (!DATABASE_URL) {
    throw Object.assign(
      new Error('DATABASE_URL precisa estar configurada nas variaveis de ambiente da Vercel.'),
      { status: 500 }
    );
  }

  if (isProductionRuntime && isLocalDatabaseUrl(DATABASE_URL)) {
    throw Object.assign(
      new Error('DATABASE_URL da Vercel esta apontando para localhost/127.0.0.1. Configure a connection string do Supabase em Production e faca um novo deploy.'),
      { status: 500 }
    );
  }
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

function createPoolConfig(connectionString) {
  const requiresSsl = !isLocalDatabaseUrl(connectionString) || /sslmode=require|ssl=true/i.test(connectionString);
  const normalizedConnectionString = requiresSsl
    ? removeSslQueryParams(connectionString)
    : connectionString;

  return {
    connectionString: normalizedConnectionString,
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {})
  };
}

function maskDatabaseUrl(connectionString) {
  return String(connectionString || '').replace(/:[^:@/]+@/, ':****@');
}

function getPool() {
  validateDatabaseUrl();
  if (!pool) {
    pool = new Pool(createPoolConfig(DATABASE_URL));
  }
  return pool;
}

function query(sql, params = []) {
  return getPool().query(sql, params);
}

module.exports = {
  DATABASE_URL,
  getPool,
  maskDatabaseUrl,
  query
};
