const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null }, // null pour utilisateurs Google OAuth
    role: { type: String, enum: ['System Admin', 'Super Admin', 'Admin', 'Technicien', 'Lecture seule'], default: 'Admin' },
    parentAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedMachines: [{ type: String }], // Array of `deviceId`s specifically assigned to Technicians

    // Google OAuth
    googleId: { type: String, default: null },
    name: { type: String, default: null },
    avatar: { type: String, default: null },

    // JWT Refresh Tokens (multi-device)
    refreshTokens: [{ type: String }],

    // Reset Password (code 6 chiffres)
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Email Verification (code 6 chiffres)
    emailVerifyCode: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },

    // Sécurité & Audit
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    lastIp: { type: String, default: null },
    failedLogins: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    verified: { type: Boolean, default: false }
});

// Compare password (retourne false si compte Google sans password)
userSchema.methods.comparePassword = async function (password) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
