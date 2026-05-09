const express = require('express');
const config = require('../config');
const { asyncHandler } = require('../utils/errors');
const authService = require('../services/authService');

const router = express.Router();

router.post(
    '/reset-password',
    asyncHandler(async (req, res) => {
        const { username, currentPassword, newPassword } = req.body || {};
        await authService.resetPassword(username, currentPassword, newPassword);
        res.status(204).send();
    })
);

router.post(
    '/login',
    asyncHandler(async (req, res) => {
        const { username, password } = req.body || {};
        const loginResult = await authService.login(username, password);

        res.cookie(config.sessionCookieName, loginResult.sessionToken, authService.cookieOptions());
        res.json({ user: loginResult.user });
    })
);

router.post(
    '/logout',
    asyncHandler(async (req, res) => {
        const sessionToken = req.cookies?.[config.sessionCookieName];
        await authService.logout(sessionToken);
        res.clearCookie(config.sessionCookieName, {
            ...authService.cookieOptions(),
            maxAge: 0
        });
        res.status(204).send();
    })
);

router.get(
    '/me',
    asyncHandler(async (req, res) => {
        const sessionToken = req.cookies?.[config.sessionCookieName];
        const user = await authService.getUserBySessionToken(sessionToken);

        if (!user) {
            return res.status(401).json({ error: 'Not authenticated.' });
        }

        return res.json({ user });
    })
);

module.exports = router;
