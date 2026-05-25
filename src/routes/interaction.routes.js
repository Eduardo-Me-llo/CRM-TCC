const express = require('express');
const controller = require('../controllers/interaction.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, requirePermission('client_interactions.read'), asyncHandler(controller.list));
router.post('/send-email', ...tenantRead, requirePermission('client_interactions.create'), asyncHandler(controller.sendEmail));
router.post('/', ...tenantRead, requirePermission('client_interactions.create'), asyncHandler(controller.create));
router.put('/:interactionId', ...tenantRead, requirePermission('client_interactions.update'), asyncHandler(controller.update));
router.delete('/:interactionId', ...tenantRead, requirePermission('client_interactions.delete'), asyncHandler(controller.remove));

module.exports = router;
