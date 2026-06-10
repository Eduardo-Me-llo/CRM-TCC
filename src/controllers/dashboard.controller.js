const dashboardModel = require('../models/dashboard.model');

async function summary(req, res) {
  res.json(await dashboardModel.summary(req.user.tenantId));
}

module.exports = { summary };
