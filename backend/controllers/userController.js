const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ─── Helpers JWT ─────────────────────────────────────────────────────────────

function generateAccessToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role, parentAdminId: user.parentAdminId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
    );
}

function getMailTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

// ─── Seed Default Admin ───────────────────────────────────────────────────────

exports.seedDefaultAdmin = async () => {
    const patron = await User.findOne({ email: 'patron@inovaria.tech' });
    if (!patron) {
        const hash = await bcrypt.hash('patron2026', 10);
        await User.create({ email: 'patron@inovaria.tech', passwordHash: hash, role: 'System Admin', verified: true });
        console.log('✅ Patron Système créé: patron@inovaria.tech / patron2026');
    }
    await migrateExistingMachines();
};

async function migrateExistingMachines() {
    try {
        const Machine = require('../models/Machine');
        const firstAdmin = await User.findOne({ role: { $in: ['Admin', 'Super Admin'] } });
        if (firstAdmin) {
            const result = await Machine.updateMany({ ownerId: { $exists: false } }, { $set: { ownerId: firstAdmin._id } });
            if (result.modifiedCount > 0) console.log(`🔧 Migration: ${result.modifiedCount} machines attribuées à ${firstAdmin.email}`);
        }
    } catch (err) { console.error('❌ Erreur migration machines:', err.message); }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        let rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'Inconnue';
        if (rawIp === '::1') rawIp = '127.0.0.1';
        if (rawIp.includes('::ffff:')) rawIp = rawIp.replace('::ffff:', '');
        const ip = rawIp;

        if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

        const user = await User.findOne({ email: email.toLowerCase() });
        const Notification = require('../models/Notification');

        let superAdminId = null;
        if (user && user.parentAdminId) superAdminId = user.parentAdminId;
        else if (user && user.role === 'Super Admin') superAdminId = user._id;
        else { const firstSA = await User.findOne({ role: 'Super Admin' }); if (firstSA) superAdminId = firstSA._id; }

        if (!user) {
            if (superAdminId) await Notification.create({ ownerId: superAdminId, deviceId: '🔐 SECURITE', title: 'Tentative (Compte Inconnu)', message: `Échec connexion email inconnu (${email}). IP: ${ip}`, type: 'warning' });
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        if (user.googleId && !user.passwordHash) {
            return res.status(400).json({ error: 'Ce compte utilise la connexion Google. Cliquez sur "Continuer avec Google".' });
        }

        if (user.locked) {
            if (superAdminId) await Notification.create({ ownerId: superAdminId, deviceId: '🔐 SECURITE', title: 'Tentative sur compte bloqué', message: `Tentative sur le compte bloqué ${user.email}. IP: ${ip}`, type: 'danger' });
            return res.status(403).json({ error: "Ce compte est actuellement bloqué pour des raisons de sécurité." });
        }

        if (user.verified === false) {
            return res.status(403).json({ error: "Votre compte n'est pas encore vérifié. Vérifiez votre email pour le code de confirmation." });
        }

        const valid = await user.comparePassword(password);
        if (!valid) {
            user.failedLogins = (user.failedLogins || 0) + 1;
            let type = 'warning', title = 'Échec de connexion';
            let message = `Échec connexion ${user.email}. IP: ${ip}. Échec N°${user.failedLogins}`;
            if (user.failedLogins >= 3) {
                user.locked = true;
                title = '🚨 Compte Verrouillé (Sécurité)';
                message = `${user.email} verrouillé après ${user.failedLogins} échecs. IP: ${ip}`;
                type = 'danger';
            }
            await user.save();
            if (superAdminId) await Notification.create({ ownerId: superAdminId, deviceId: '🔐 SECURITE', title, message, type });
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        if (user.lastIp && user.lastIp !== ip) {
            if (superAdminId) await Notification.create({ ownerId: superAdminId, deviceId: '🔐 SECURITE', title: '🟡 Anomalie: Nouvelle IP', message: `${user.email} connecté depuis IP: ${ip} (Précédente: ${user.lastIp}).`, type: 'warning' });
        }
        if (superAdminId) await Notification.create({ ownerId: superAdminId, deviceId: '🔐 SECURITE', title: '✅ Connexion réussie', message: `${user.email} connecté. IP: ${ip}`, type: 'info' });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.failedLogins = 0;
        user.lastIp = ip;
        user.lastLogin = new Date();
        user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
        await user.save();

        res.json({
            success: true, accessToken, refreshToken,
            user: { id: user._id, email: user.email, name: user.name, role: user.role, parentAdminId: user.parentAdminId, avatar: user.avatar, lastLogin: user.lastLogin }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/impersonate ────────────────────────────────────────────────
exports.impersonate = async (req, res) => {
    try {
        const tokenH = req.headers.authorization?.split(' ')[1];
        if (!tokenH) return res.status(401).json({ error: 'Non autorisé' });
        const decoded = jwt.verify(tokenH, process.env.JWT_SECRET);

        const { targetUserId } = req.body;
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId requis' });

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) return res.status(404).json({ error: 'Compte cible introuvable' });

        if (decoded.role !== 'Super Admin' && decoded.role !== 'System Admin' && String(targetUser.parentAdminId) !== String(decoded.id)) {
            return res.status(403).json({ error: 'Accès refusé. Vous ne gérez pas ce compte.' });
        }

        const accessToken = generateAccessToken(targetUser);
        const refreshToken = generateRefreshToken(targetUser);

        targetUser.refreshTokens = [...(targetUser.refreshTokens || []).slice(-4), refreshToken];
        await targetUser.save();

        res.json({
            success: true, accessToken, refreshToken,
            user: { id: targetUser._id, email: targetUser.email, name: targetUser.name, role: targetUser.role, parentAdminId: targetUser.parentAdminId, avatar: targetUser.avatar, lastLogin: targetUser.lastLogin }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token requis' });
        let decoded;
        try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); }
        catch (e) { return res.status(401).json({ error: 'Refresh token invalide ou expiré' }); }
        const user = await User.findById(decoded.id);
        if (!user || !user.refreshTokens.includes(refreshToken)) return res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });
        res.json({ success: true, accessToken: generateAccessToken(user) });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

exports.logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            const decoded = jwt.decode(refreshToken);
            if (decoded && decoded.id) await User.findByIdAndUpdate(decoded.id, { $pull: { refreshTokens: refreshToken } });
        }
        res.json({ success: true, message: 'Déconnecté' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/google ────────────────────────────────────────────────────
// Si le compte EXISTE → connexion directe
// Si le compte N'EXISTE PAS → création auto (Super Admin) + envoi code vérification email

exports.googleAuth = async (req, res) => {
    try {
        const { googleId, email, name, avatar } = req.body;
        if (!googleId || !email) return res.status(400).json({ error: 'Données Google incomplètes' });

        let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

        // ── Compte inexistant → création automatique ──────────────────────────
        if (!user) {
            const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedCode = crypto.createHash('sha256').update(verifyCode).digest('hex');

            user = await User.create({
                email: email.toLowerCase(),
                name: name || '',
                avatar: avatar || '',
                googleId,
                role: 'Super Admin',
                verified: false,
                passwordHash: null,
                parentAdminId: null,
                emailVerifyCode: hashedCode,
                emailVerifyExpires: new Date(Date.now() + 30 * 60 * 1000)
            });

            // Envoi email avec code de vérification (Asynchrone pour ne pas bloquer)
            const transporter = getMailTransporter();
            transporter.sendMail({
                from: `"IntelliMettry Manager" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Votre code de vérification — IntelliMettry',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#020508;color:#f5f5f7;padding:40px;border-radius:16px;">
                        <h2 style="color:#af52de;font-family:monospace;letter-spacing:2px;">INTELLIMETTRY MANAGER</h2>
                        <h3>Vérification de votre compte</h3>
                        <p>Bonjour ${name || email},</p>
                        <p>Votre compte a été créé via Google. Entrez ce code pour activer votre accès (valide <strong>30 minutes</strong>) :</p>
                        <div style="margin:28px 0;text-align:center;">
                            <span style="font-family:monospace;font-size:3rem;font-weight:900;letter-spacing:12px;color:#af52de;background:rgba(175,82,222,0.1);padding:20px 30px;border-radius:16px;border:2px solid rgba(175,82,222,0.3);display:inline-block;">${verifyCode}</span>
                        </div>
                        <p style="color:#86868b;font-size:12px;">Ne partagez ce code avec personne.</p>
                    </div>
                `
            }).catch(mailErr => console.error('❌ Erreur email vérification Google:', mailErr.message));

            const Notification = require('../models/Notification');
            const sysa = await User.findOne({ role: 'System Admin' });
            if (sysa) await Notification.create({ ownerId: sysa._id, deviceId: '🔐 SECURITE', title: '🟡 Nouveau compte Google (non vérifié)', message: `${email} a créé un compte via Google. En attente de vérification.`, type: 'warning' });

            return res.status(201).json({
                needsVerification: true,
                email: user.email,
                message: 'Compte créé ! Vérifiez votre email pour le code d\'activation.'
            });
        }

        // ── Compte existant → vérifications et connexion ──────────────────────
        // Mise à jour de l'association Google
        user.googleId = googleId;
        user.avatar = avatar || user.avatar;
        user.name = name || user.name;
        await user.save();

        if (user.locked) return res.status(403).json({ error: "Ce compte est bloqué." });

        // Si le compte existe mais n'est pas vérifié, générer un nouveau code
        if (!user.verified) {
            const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedCode = crypto.createHash('sha256').update(verifyCode).digest('hex');
            user.emailVerifyCode = hashedCode;
            user.emailVerifyExpires = new Date(Date.now() + 30 * 60 * 1000);
            await user.save();

            const transporter = getMailTransporter();
            transporter.sendMail({
                from: `"IntelliMettry Manager" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Votre code de vérification — IntelliMettry',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#020508;color:#f5f5f7;padding:40px;border-radius:16px;">
                        <h2 style="color:#af52de;font-family:monospace;letter-spacing:2px;">INTELLIMETTRY MANAGER</h2>
                        <h3>Vérification de votre compte</h3>
                        <p>Votre code de vérification (valide <strong>30 minutes</strong>) :</p>
                        <div style="margin:28px 0;text-align:center;">
                            <span style="font-family:monospace;font-size:3rem;font-weight:900;letter-spacing:12px;color:#af52de;background:rgba(175,82,222,0.1);padding:20px 30px;border-radius:16px;border:2px solid rgba(175,82,222,0.3);display:inline-block;">${verifyCode}</span>
                        </div>
                        <p style="color:#86868b;font-size:12px;">Ne partagez ce code avec personne.</p>
                    </div>
                `
            }).catch(mailErr => console.error('❌ Erreur email vérification:', mailErr.message));

            return res.status(200).json({
                needsVerification: true,
                email: user.email,
                message: 'Compte non vérifié. Un nouveau code a été envoyé à votre email.'
            });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.lastLogin = new Date();
        user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
        await user.save();

        const Notification = require('../models/Notification');
        const sa = await User.findOne({ role: { $in: ['Super Admin', 'System Admin'] } });
        if (sa) await Notification.create({ ownerId: sa._id, deviceId: '🔐 SECURITE', title: '✅ Connexion Google', message: `${user.email} connecté via Google.`, type: 'info' });

        res.json({
            success: true, accessToken, refreshToken,
            user: { id: user._id, email: user.email, name: user.name, role: user.role, parentAdminId: user.parentAdminId, avatar: user.avatar }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/register-superadmin ──────────────────────────────────────
// Crée un compte Super Admin → envoi code 6 chiffres → doit vérifier email

exports.registerSuperAdmin = async (req, res) => {
    try {
        const { email, password, confirmPassword, inviteCode } = req.body;
        if (!email || !password || !inviteCode) return res.status(400).json({ error: 'Tous les champs sont requis' });
        if (password !== confirmPassword) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
        if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
        if (inviteCode !== process.env.SUPERADMIN_INVITE_CODE) return res.status(403).json({ error: 'Code d\'invitation invalide' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

        const passwordHash = await bcrypt.hash(password, 10);

        // Code vérification email à 6 chiffres
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = crypto.createHash('sha256').update(verifyCode).digest('hex');

        const user = await User.create({
            email: email.toLowerCase(),
            passwordHash,
            role: 'Super Admin',
            verified: false, // doit vérifier son email d'abord
            parentAdminId: null,
            emailVerifyCode: hashedCode,
            emailVerifyExpires: new Date(Date.now() + 30 * 60 * 1000)
        });

        // Envoi email avec code
        try {
            const transporter = getMailTransporter();
            await transporter.sendMail({
                from: `"IntelliMettry Manager" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Votre code de vérification — IntelliMettry',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#020508;color:#f5f5f7;padding:40px;border-radius:16px;">
                        <h2 style="color:#af52de;font-family:monospace;letter-spacing:2px;">INTELLIMETTRY MANAGER</h2>
                        <h3>Vérification de votre compte Super Admin</h3>
                        <p>Votre code de vérification (valide <strong>30 minutes</strong>) :</p>
                        <div style="margin:28px 0;text-align:center;">
                            <span style="font-family:monospace;font-size:3rem;font-weight:900;letter-spacing:12px;color:#af52de;background:rgba(175,82,222,0.1);padding:20px 30px;border-radius:16px;border:2px solid rgba(175,82,222,0.3);display:inline-block;">${verifyCode}</span>
                        </div>
                        <p style="color:#86868b;font-size:12px;">Entrez ce code sur la page d'inscription. Ne le partagez avec personne.</p>
                    </div>
                `
            });
        } catch (mailErr) { console.error('❌ Erreur email vérification:', mailErr.message); }

        const Notification = require('../models/Notification');
        const sysa = await User.findOne({ role: 'System Admin' });
        if (sysa) await Notification.create({ ownerId: sysa._id, deviceId: '🔐 SECURITE', title: '🟡 Nouveau Super Admin (non vérifié)', message: `${email} a créé un compte Super Admin en attente de vérification.`, type: 'warning' });

        res.status(201).json({
            success: true,
            message: 'Compte créé ! Vérifiez votre email pour le code d\'activation.',
            email: user.email
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────

exports.verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

        const hashedCode = crypto.createHash('sha256').update(code.trim()).digest('hex');
        const user = await User.findOne({
            email: email.toLowerCase(),
            emailVerifyCode: hashedCode,
            emailVerifyExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Code invalide ou expiré (30 min). Recréez votre compte.' });

        user.verified = true;
        user.emailVerifyCode = null;
        user.emailVerifyExpires = null;
        user.lastLogin = new Date();
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshTokens = [refreshToken];
        await user.save();

        const Notification = require('../models/Notification');
        const sysa = await User.findOne({ role: 'System Admin' });
        if (sysa) await Notification.create({ ownerId: sysa._id, deviceId: '🔐 SECURITE', title: '✅ Super Admin vérifié', message: `${user.email} a vérifié son email et est maintenant actif.`, type: 'info' });

        res.json({
            success: true,
            accessToken, refreshToken,
            user: { id: user._id, email: user.email, role: user.role }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Envoi d'un CODE à 6 chiffres par email (plus de lien)

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requis' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'Aucun compte ne correspond à cette adresse email.' });



        // Code 6 chiffres (valide 15 min)
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordToken = crypto.createHash('sha256').update(code).digest('hex');
        user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();

        try {
            const transporter = getMailTransporter();
            await transporter.sendMail({
                from: `"IntelliMettry Manager" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Votre code de réinitialisation — IntelliMettry',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#020508;color:#f5f5f7;padding:40px;border-radius:16px;">
                        <h2 style="color:#00d4ff;font-family:monospace;letter-spacing:2px;">INTELLIMETTRY MANAGER</h2>
                        <h3>Réinitialisation de mot de passe</h3>
                        <p>Votre code de réinitialisation (valide <strong>15 minutes</strong>) :</p>
                        <div style="margin:28px 0;text-align:center;">
                            <span style="font-family:monospace;font-size:3rem;font-weight:900;letter-spacing:12px;color:#ff0033;background:rgba(255,0,51,0.1);padding:20px 30px;border-radius:16px;border:2px solid rgba(255,0,51,0.3);display:inline-block;">${code}</span>
                        </div>
                        <p style="color:#86868b;font-size:12px;">Entrez ce code sur la page de réinitialisation. Ne le partagez avec personne.</p>
                    </div>
                `
            });
        } catch (mailErr) { console.error('❌ Erreur email reset:', mailErr.message); }

        res.json({ success: true, message: 'Si cet email existe, un code a été envoyé.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── POST /api/auth/check-reset-code ───────────────────────────────────
// Vérifie le code sans réinitialiser

exports.checkResetCode = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ valid: false, error: 'Email et code requis' });
        const hashedCode = crypto.createHash('sha256').update(code.trim()).digest('hex');
        const user = await User.findOne({
            email: email.toLowerCase(),
            resetPasswordToken: hashedCode,
            resetPasswordExpires: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ valid: false, error: 'Code invalide ou expiré (15 min). Refaites la demande.' });
        res.json({ valid: true });
    } catch (err) { res.status(500).json({ valid: false, error: err.message }); }
};

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Vérifie le code 6 chiffres + email, puis change le mot de passe

exports.resetPassword = async (req, res) => {
    try {
        const { email, code, password, confirmPassword } = req.body;
        if (!email || !code || !password) return res.status(400).json({ error: 'Email, code et mot de passe requis' });
        if (password !== confirmPassword) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
        if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });

        const hashedCode = crypto.createHash('sha256').update(code.trim()).digest('hex');
        const user = await User.findOne({
            email: email.toLowerCase(),
            resetPasswordToken: hashedCode,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Code invalide ou expiré (15 min). Refaites la demande.' });

        user.passwordHash = await bcrypt.hash(password, 10);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.refreshTokens = [];
        user.failedLogins = 0;
        user.locked = false;
        await user.save();

        res.json({ success: true, message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── User Management (inchangé) ───────────────────────────────────────────────

exports.getUsers = async (req, res) => {
    try {
        const { parentAdminId, requesterRole } = req.query;
        if (requesterRole === 'System Admin') {
            return res.json(await User.find({}, '-passwordHash -refreshTokens -resetPasswordToken -emailVerifyCode'));
        }
        if (!parentAdminId) return res.json([]);

        if (requesterRole === 'Super Admin') {
            // Fetch direct children
            const direct = await User.find({ parentAdminId }, '-passwordHash -refreshTokens -resetPasswordToken -emailVerifyCode');
            // Fetch children of direct children (sub-admins' techniciens)
            const subAdminIds = direct.filter(u => u.role === 'Admin').map(u => u._id);
            const nested = await User.find({ parentAdminId: { $in: subAdminIds } }, '-passwordHash -refreshTokens -resetPasswordToken -emailVerifyCode');

            // Combine and return
            return res.json([...direct, ...nested]);
        }

        res.json(await User.find({ parentAdminId }, '-passwordHash -refreshTokens -resetPasswordToken -emailVerifyCode'));
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createUser = async (req, res) => {
    try {
        const { email, password, role, parentAdminId, assignedMachines } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ error: `L'email "${email}" est déjà utilisé` });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: email.toLowerCase(),
            passwordHash,
            role: role || 'Admin',
            parentAdminId: parentAdminId || null,
            assignedMachines: assignedMachines || [],
            verified: true  // Auto-vérifié car créé par un Admin (pas besoin de code email)
        });
        res.status(201).json({ _id: user._id, email: user.email, role: user.role, parentAdminId: user.parentAdminId, createdAt: user.createdAt });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
        res.json({ success: true, deleted: user.email });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateUserStatus = async (req, res) => {
    try {
        const { locked, verified } = req.body;
        const updateData = {};
        if (locked !== undefined) updateData.locked = locked;
        if (verified !== undefined) updateData.verified = verified;
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
        res.json({ success: true, user: { email: user.email, locked: user.locked, verified: user.verified } });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateUserMachines = async (req, res) => {
    try {
        const { assignedMachines } = req.body;
        if (!Array.isArray(assignedMachines)) return res.status(400).json({ error: 'assignedMachines doit être un tableau' });

        const user = await User.findByIdAndUpdate(req.params.id, { assignedMachines }, { new: true });
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

        res.json({ success: true, assignedMachines: user.assignedMachines });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAuthStatus = async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ setupRequired: count === 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.setupAdmin = async (req, res) => {
    try {
        const count = await User.countDocuments();
        if (count > 0) return res.status(403).json({ error: 'Le système est déjà configuré' });
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ email: email.toLowerCase(), passwordHash, role: 'Admin', verified: true });
        res.status(201).json({ success: true, message: 'Administrateur créé avec succès' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.changePassword = async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;
        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Champs manquants' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        // Si le compte a été créé via Google uniquement (pas de mot de passe)
        if (!user.passwordHash) {
            return res.status(400).json({ error: 'Ce compte est géré par Google. Impossible de changer le mot de passe ici.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ success: true, message: 'Mot de passe mis à jour avec succès' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
