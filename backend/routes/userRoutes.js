const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
// ── Auth Routes ──────────────────────────────────────────────────
router.post('/auth/login', userController.login);
router.post('/auth/logout', userController.logout);
router.post('/auth/refresh', userController.refreshToken);
router.post('/auth/google', userController.googleAuth);
router.post('/auth/register-superadmin', userController.registerSuperAdmin);
router.post('/auth/verify-email', userController.verifyEmail);
router.post('/auth/forgot-password', userController.forgotPassword);
router.post('/auth/check-reset-code', userController.checkResetCode);
router.post('/auth/reset-password', userController.resetPassword);
router.get('/auth/status', userController.getAuthStatus);
router.post('/auth/setup', userController.setupAdmin);
router.put('/auth/password', userController.changePassword);
router.post('/auth/impersonate', userController.impersonate);
// ── User Management Routes ───────────────────────────────────────
router.get('/users', userController.getUsers);
router.post('/users', userController.createUser);
router.delete('/users/:id', userController.deleteUser);
router.put('/users/:id/status', userController.updateUserStatus);
router.put('/users/:id/machines', userController.updateUserMachines);
module.exports = router;