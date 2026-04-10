// app_theme.dart — fichier central qui réexporte tout.
// Importez ce seul fichier dans vos screens pour accéder à tout.
export 'app_colors.dart';
export 'constants.dart';
export 'theme.dart';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

// ── Text Styles ───────────────────────────────────────────────────────────────

class AppText {
  static TextStyle heading1 = GoogleFonts.inter(
      color: AppColors.textPrimary,
      fontSize: 28,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.5);
  static TextStyle heading2 = GoogleFonts.inter(
      color: AppColors.textPrimary, fontSize: 22, fontWeight: FontWeight.w700);
  static TextStyle heading3 = GoogleFonts.inter(
      color: AppColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w600);
  static TextStyle body =
      GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 14);
  static TextStyle bodySecondary =
      GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 14);
  static TextStyle caption =
      GoogleFonts.inter(color: AppColors.textMuted, fontSize: 12);
  static TextStyle label = GoogleFonts.inter(
      color: AppColors.textMuted,
      fontSize: 11,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.5);
}

// ── Roles ─────────────────────────────────────────────────────────────────────

class AppRoles {
  static const systemAdmin = 'System Admin';
  static const superAdmin = 'Super Admin';
  static const admin = 'Admin';
  static const technician = 'Technicien';

  static String label(String role) => switch (role) {
        'System Admin' => 'Système Admin',
        'Super Admin' => 'Super Admin',
        'Admin' => 'Administrateur',
        'Technicien' => 'Technicien',
        _ => role,
      };

  static Color color(String role) => switch (role) {
        'System Admin' => AppColors.danger,
        'Super Admin' => AppColors.primary,
        'Admin' => AppColors.accent,
        'Technicien' => AppColors.teal,
        _ => AppColors.textSecondary,
      };
}
