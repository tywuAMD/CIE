const express = require('express');
const { asyncHandler } = require('../utils/errors');
const reservationService = require('../services/reservationService');

const router = express.Router();

router.get(
    '/',
    asyncHandler(async (req, res) => {
        const reservations = await reservationService.listReservations({
            platform: req.query.platform,
            date: req.query.date
        }, req.authUser);

        res.json({ reservations });
    })
);

router.post(
    '/',
    asyncHandler(async (req, res) => {
        const reservation = await reservationService.createReservation(req.body || {}, req.authUser);
        res.status(201).json({ reservation });
    })
);

router.post(
    '/cleanup-expired',
    asyncHandler(async (req, res) => {
        const result = await reservationService.cleanupExpiredReservations(req.authUser);
        res.json(result);
    })
);

router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        await reservationService.deleteReservation(req.params.id, req.authUser);
        res.status(204).send();
    })
);

module.exports = router;
