const express = require('express');
const controller = require('../controllers/company.controller');
const { requireAuth, requirePermission, requireTenantUser } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();
const tenantRead = [requireAuth, requireTenantUser];

router.get('/', ...tenantRead, requirePermission('client_companies.read'), asyncHandler(controller.list));
router.get('/export', ...tenantRead, requirePermission('exports.read'), asyncHandler(controller.exportCsv));
router.post('/import', ...tenantRead, requirePermission('imports.create'), asyncHandler(controller.importCsv));
router.get('/:companyId', ...tenantRead, requirePermission('client_companies.read'), asyncHandler(controller.get));
router.post('/', ...tenantRead, requirePermission('client_companies.create'), asyncHandler(controller.create));
router.put('/:companyId', ...tenantRead, requirePermission('client_companies.update'), asyncHandler(controller.update));
router.delete('/:companyId', ...tenantRead, requirePermission('client_companies.delete'), asyncHandler(controller.remove));

module.exports = router;
