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

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function validatePhone(phone) {
  const digits = normalizeDigits(phone);
  return digits.length >= 8 && digits.length <= 13;
}

function validateCNPJ(cnpj) {
  const digits = normalizeDigits(cnpj);
  if (digits.length !== 14 || /^(.?)\1+$/.test(digits)) return false;
  const numbers12 = digits.substring(0, 12).split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum1 = numbers12.reduce((acc, number, index) => acc + number * weights1[index], 0);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  const numbers13 = [...numbers12, d1];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum2 = numbers13.reduce((acc, number, index) => acc + number * weights2[index], 0);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  return Number(digits[12]) === d1 && Number(digits[13]) === d2;
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
  parseTags,
  validateEmail,
  validatePhone,
  validateCNPJ
};
