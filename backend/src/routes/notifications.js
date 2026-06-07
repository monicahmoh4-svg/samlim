const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { notifRouter } = require('./analytics');
module.exports = notifRouter;
