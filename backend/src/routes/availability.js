const express = require('express');
const { asyncHandler } = require('../utils/errors');
const reservationService = require('../services/reservationService');

const router = express.Router();

router.get(
    '/',
    asyncHandler(async (req, res) => {
        const data = await reservationService.getAvailability(req.query.platform, req.query.date);
        res.json(data);
    })
);

module.exports = router;
