const { ensureDatabaseReady } = require('../services/database-init.service');

async function databaseReadyMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  try {
    await ensureDatabaseReady();
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = databaseReadyMiddleware;
