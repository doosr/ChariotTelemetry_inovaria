const jwt = require('jsonwebtoken');

/**
 * Middleware: Vérifie l'access token JWT (Authorization: Bearer <token>)
 * Injecte req.user si valide.
 */
module.exports = function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token d\'accès manquant' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, email, role, parentAdminId }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Token invalide' });
    }
};
