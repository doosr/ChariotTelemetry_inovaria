import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/app_theme.dart';

// ── GradientButton ────────────────────────────────────────────────────────────

class GradientButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final LinearGradient gradient;
  final double height;
  final Widget? icon;

  const GradientButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.gradient = AppColors.gradientPurpleBlue,
    this.height = 52,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed != null ? gradient : null,
          color: onPressed == null ? AppColors.cardBorder : null,
          borderRadius: BorderRadius.circular(14),
          boxShadow: onPressed != null
              ? [
                  BoxShadow(
                      color: gradient.colors.first.withAlpha(80),
                      blurRadius: 20,
                      offset: const Offset(0, 8))
                ]
              : null,
        ),
        child: ElevatedButton(
          onPressed: loading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      color: Colors.white, strokeWidth: 2.5))
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[icon!, const SizedBox(width: 8)],
                    Text(label,
                        style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
        ),
      ),
    );
  }
}

// ── AppCard ───────────────────────────────────────────────────────────────────

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final Color? borderColor;
  final VoidCallback? onTap;

  const AppCard(
      {super.key,
      required this.child,
      this.padding,
      this.borderColor,
      this.onTap});

  @override
  Widget build(BuildContext context) {
    final card = Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: borderColor ?? AppColors.cardBorder),
      ),
      padding: padding ?? const EdgeInsets.all(16),
      child: child,
    );
    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: card);
    }
    return card;
  }
}

// ── StatCard ──────────────────────────────────────────────────────────────────

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final LinearGradient gradient;
  final String? subtitle;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.gradient = AppColors.gradientPurpleBlue,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
              color: gradient.colors.first.withAlpha(50),
              blurRadius: 15,
              offset: const Offset(0, 6))
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: Colors.white.withAlpha(30),
                    borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: Colors.white, size: 20),
              ),
              if (subtitle != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                      color: Colors.white.withAlpha(30),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text(subtitle!,
                      style: GoogleFonts.inter(
                          color: Colors.white70,
                          fontSize: 10,
                          fontWeight: FontWeight.w600)),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text(value,
              style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(label,
              style: GoogleFonts.inter(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;

  const SectionHeader(
      {super.key, required this.title, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: AppText.heading3),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            child: Text(action!,
                style: GoogleFonts.inter(
                    color: AppColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ),
      ],
    );
  }
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final bool dot;

  const StatusBadge(
      {super.key, required this.label, required this.color, this.dot = true});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
                width: 5,
                height: 5,
                decoration:
                    BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 5),
          ],
          Text(label,
              style: GoogleFonts.inter(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4)),
        ],
      ),
    );
  }
}

// ── AppTextField ──────────────────────────────────────────────────────────────

class AppTextField extends StatelessWidget {
  final String hint;
  final TextEditingController? controller;
  final bool obscure;
  final Widget? prefix;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final void Function(String)? onChanged;
  final bool autofocus;
  final int maxLines;

  const AppTextField({
    super.key,
    required this.hint,
    this.controller,
    this.obscure = false,
    this.prefix,
    this.suffix,
    this.keyboardType,
    this.validator,
    this.onChanged,
    this.autofocus = false,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      autocorrect: false,
      autofocus: autofocus,
      maxLines: obscure ? 1 : maxLines,
      style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: prefix,
        suffixIcon: suffix,
      ),
      validator: validator,
      onChanged: onChanged,
    );
  }
}

// ── LoadingOverlay ────────────────────────────────────────────────────────────

class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: CircularProgressIndicator(
            color: AppColors.primary, strokeWidth: 2.5),
      );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;

  const EmptyState(
      {super.key, required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 64, color: AppColors.textMuted.withAlpha(80)),
          const SizedBox(height: 16),
          Text(title, style: AppText.bodySecondary.copyWith(fontSize: 16)),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(subtitle!,
                style: AppText.caption, textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

Future<bool?> showConfirm(
  BuildContext context, {
  required String title,
  required String content,
  String confirmLabel = 'Confirmer',
  Color confirmColor = AppColors.danger,
}) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: AppText.heading3),
      content: Text(content, style: AppText.bodySecondary),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Annuler',
                style: GoogleFonts.inter(color: AppColors.textSecondary))),
        TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmLabel,
                style: GoogleFonts.inter(
                    color: confirmColor, fontWeight: FontWeight.w700))),
      ],
    ),
  );
}
