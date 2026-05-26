const express = require('express');
const controller = require('../controllers/notification.controller');
const { requireAuth, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, asyncHandler(controller.list));
router.post('/dismiss-all', ...tenantRead, asyncHandler(controller.dismissAll));
router.post('/:notificationId/dismiss', ...tenantRead, asyncHandler(controller.dismiss));

module.exports = router;
