function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ''));
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

module.exports = {
  asyncHandler,
  isUuid,
  notFound
};
