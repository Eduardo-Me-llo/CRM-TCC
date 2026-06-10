const auditModel = require('../models/audit.model');

async function list(req, res) {
  res.json(await auditModel.list(req.user.tenantId));
}

module.exports = { list };
