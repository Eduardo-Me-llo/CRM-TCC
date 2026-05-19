const express = require('express');
const controller = require('../controllers/contact.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, requirePermission('client_contacts.read'), asyncHandler(controller.list));
router.post('/', ...tenantRead, requirePermission('client_contacts.create'), asyncHandler(controller.create));
router.put('/:contactId', ...tenantRead, requirePermission('client_contacts.update'), asyncHandler(controller.update));
router.delete('/:contactId', ...tenantRead, requirePermission('client_contacts.delete'), asyncHandler(controller.remove));

module.exports = router;
