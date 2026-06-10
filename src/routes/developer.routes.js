const express = require('express');
const controller = require('../controllers/developer.controller');
const { requireAuth, requireDeveloper } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.use(requireAuth, requireDeveloper);
router.get('/summary', asyncHandler(controller.summary));
router.get('/settings', asyncHandler(controller.getSettings));
router.put('/settings', asyncHandler(controller.updateSettings));
router.get('/tenants', asyncHandler(controller.listTenants));
router.post('/tenants', asyncHandler(controller.createTenant));
router.put('/tenants/:tenantId', asyncHandler(controller.updateTenant));
router.get('/tenants/:tenantId/users', asyncHandler(controller.listUsers));
router.post('/tenants/:tenantId/users', asyncHandler(controller.createUser));
router.put('/users/:userId', asyncHandler(controller.updateUser));
router.delete('/users/:userId', asyncHandler(controller.removeUser));

module.exports = router;
