const express = require('express');
const controller = require('../controllers/auth.controller');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

router.post('/login', asyncHandler(controller.login));

module.exports = router;
