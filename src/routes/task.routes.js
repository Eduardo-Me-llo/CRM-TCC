const express = require('express');
const controller = require('../controllers/task.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, requirePermission('tasks.read'), asyncHandler(controller.list));
router.post('/', ...tenantRead, requirePermission('tasks.create'), asyncHandler(controller.create));
router.put('/:taskId', ...tenantRead, requirePermission('tasks.update'), asyncHandler(controller.update));
router.delete('/:taskId', ...tenantRead, requirePermission('tasks.delete'), asyncHandler(controller.remove));

module.exports = router;
