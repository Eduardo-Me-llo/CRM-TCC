const { query } = require('../config/database');

async function getBoolean(key, fallback = false) {
  const result = await query(`SELECT value FROM system_settings WHERE key = $1`, [key]);
  if (!result.rows.length) return fallback;
  return Boolean(result.rows[0].value);
}

async function setBoolean(key, value) {
  const result = await query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING key, value, updated_at`,
    [key, JSON.stringify(Boolean(value))]
  );
  return {
    key: result.rows[0].key,
    value: Boolean(result.rows[0].value),
    updatedAt: result.rows[0].updated_at
  };
}

async function getDeveloperSettings() {
  return {
    loginEmailCodeEnabled: await getBoolean('login_email_code_enabled', true)
  };
}

async function updateDeveloperSettings({ loginEmailCodeEnabled }) {
  if (loginEmailCodeEnabled !== undefined) {
    await setBoolean('login_email_code_enabled', loginEmailCodeEnabled);
  }
  return getDeveloperSettings();
}

module.exports = {
  getBoolean,
  getDeveloperSettings,
  updateDeveloperSettings
};
