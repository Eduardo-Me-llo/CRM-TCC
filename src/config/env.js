const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'crm-dev-secret-change-me';
const LOCAL_DATABASE_URL = 'postgres://crm_user:crm_password@localhost:5432/crm_saas';
const isProductionRuntime = process.env.VERCEL || process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || (isProductionRuntime ? '' : LOCAL_DATABASE_URL);
const EMAIL_DELIVERY_MODE = process.env.EMAIL_DELIVERY_MODE || 'simulated';
const EMAIL_FROM = process.env.EMAIL_FROM || 'CRM <no-reply@crm.local>';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

module.exports = {
  PORT,
  JWT_SECRET,
  DATABASE_URL,
  EMAIL_DELIVERY_MODE,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  isProductionRuntime
};
