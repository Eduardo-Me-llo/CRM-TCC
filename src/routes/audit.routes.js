const express = require('express');
const controller = require('../controllers/audit.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/', requireAuth, requireTenantUser, requirePermission('audit_logs.read'), asyncHandler(controller.list));

module.exports = router;
