const express = require('express');
const controller = require('../controllers/dashboard.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/summary', requireAuth, requireTenantUser, requirePermission('dashboard.read'), asyncHandler(controller.summary));

module.exports = router;
