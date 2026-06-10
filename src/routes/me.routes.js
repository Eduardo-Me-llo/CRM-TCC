const express = require('express');
const controller = require('../controllers/me.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(controller.me));
router.put('/preferences', requireAuth, asyncHandler(controller.updatePreferences));
router.put('/password', requireAuth, asyncHandler(controller.updatePassword));

module.exports = router;
