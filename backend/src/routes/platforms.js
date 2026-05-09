const express = require('express');
const { asyncHandler } = require('../utils/errors');
const reservationService = require('../services/reservationService');

const router = express.Router();

router.get(
    '/',
    asyncHandler(async (_req, res) => {
        const platforms = await reservationService.getPlatforms();
        res.json({ platforms });
    })
);

module.exports = router;
