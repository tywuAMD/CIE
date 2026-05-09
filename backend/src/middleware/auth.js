const config = require('../config');
const authService = require('../services/authService');

async function requireAuth(req, res, next) {
    try {
        const sessionToken = req.cookies?.[config.sessionCookieName];
        const user = await authService.getUserBySessionToken(sessionToken);

        if (!user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        req.authUser = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    requireAuth
};
