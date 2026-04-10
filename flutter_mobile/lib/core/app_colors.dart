import 'package:flutter/material.dart';

/// Palette de couleurs principale de l'application IntelliMetry
class AppColors {
  // ── Backgrounds
  static const Color bg = Color(0xFF020508);
  static const Color bgCard = Color(0xFF0D1117);
  static const Color card = Color(0xFF161B22);
  static const Color cardBorder = Color(0xFF21262D);
  static const Color divider = Color(0xFF1C2128);

  // ── Brand colors
  static const Color primary = Color(0xFFAF52DE);
  static const Color primaryD = Color(0xFF7B2FBE);
  static const Color accent = Color(0xFF58A6FF);
  static const Color teal = Color(0xFF2DD4BF);
  static const Color orange = Color(0xFFF97316);

  // ── Semantic colors
  static const Color success = Color(0xFF28A745);
  static const Color danger = Color(0xFFDC3545);
  static const Color warning = Color(0xFFFF9500);
  static const Color info = Color(0xFF58A6FF);

  // ── Text
  static const Color textPrimary = Color(0xFFE6EDF3);
  static const Color textSecondary = Color(0xFF8B949E);
  static const Color textMuted = Color(0xFF484F58);

  // ── Gradients
  static const LinearGradient gradientPurpleBlue = LinearGradient(
    colors: [Color(0xFFAF52DE), Color(0xFF58A6FF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient gradientDark = LinearGradient(
    colors: [Color(0xFF020508), Color(0xFF0D1117)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  static const LinearGradient gradientTeal = LinearGradient(
    colors: [Color(0xFF2DD4BF), Color(0xFF58A6FF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient gradientOrange = LinearGradient(
    colors: [Color(0xFFF97316), Color(0xFFEF4444)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}
