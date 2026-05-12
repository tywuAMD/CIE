const express = require('express');
const { asyncHandler } = require('../utils/errors');
const workspaceService = require('../services/workspaceService');

const router = express.Router();

router.post(
    '/request',
    asyncHandler(async (req, res) => {
        const result = await workspaceService.requestWorkspace(req.authUser, req.body || {});
        res.status(202).json(result);
    })
);

router.get(
    '/status',
    asyncHandler(async (req, res) => {
        const result = await workspaceService.getWorkspaceStatus(req.authUser, req.query || {});
        res.json(result);
    })
);

module.exports = router;
