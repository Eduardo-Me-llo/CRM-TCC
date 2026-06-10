const express = require('express');
const controller = require('../controllers/custom-field.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, asyncHandler(controller.list));
router.post('/', ...tenantRead, requirePermission('custom_fields.manage'), asyncHandler(controller.create));
router.put('/:fieldId', ...tenantRead, requirePermission('custom_fields.manage'), asyncHandler(controller.update));
router.delete('/:fieldId', ...tenantRead, requirePermission('custom_fields.manage'), asyncHandler(controller.remove));

module.exports = router;
