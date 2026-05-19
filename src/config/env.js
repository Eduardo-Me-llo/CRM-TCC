const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'crm-dev-secret-change-me';
const LOCAL_DATABASE_URL = 'postgres://crm_user:crm_password@localhost:5432/crm_saas';
const isProductionRuntime = process.env.VERCEL || process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || (isProductionRuntime ? '' : LOCAL_DATABASE_URL);

module.exports = {
  PORT,
  JWT_SECRET,
  DATABASE_URL,
  isProductionRuntime
};
