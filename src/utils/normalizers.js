function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getEmailDomain(email) {
  const normalized = normalizeEmail(email);
  const parts = normalized.split('@');
  return parts.length === 2 ? parts[1] : '';
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseTags(text) {
  return String(text || '').split(',').map(tag => tag.trim()).filter(Boolean);
}

module.exports = {
  getEmailDomain,
  normalizeEmail,
  normalizeEnum,
  parseMoney,
  parseTags
};
