const express = require('express');
const controller = require('../controllers/user.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/', requireAuth, requireTenantUser, requirePermission('users.read'), asyncHandler(controller.list));
router.post('/', requireAuth, requireTenantUser, requirePermission('users.create'), asyncHandler(controller.create));
router.put('/:userId', requireAuth, requireTenantUser, requirePermission('users.update'), asyncHandler(controller.update));
router.delete('/:userId', requireAuth, requireTenantUser, requirePermission('users.delete'), asyncHandler(controller.remove));

module.exports = router;
