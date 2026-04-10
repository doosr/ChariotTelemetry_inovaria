import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/app_theme.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'login_screen.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String email;
  final String code;
  const ResetPasswordScreen({super.key, required this.email, required this.code});
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscure1 = true;
  bool _obscure2 = true;
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _reset() async {
    if (_passCtrl.text != _confirmCtrl.text) {
      setState(() => _error = 'Les mots de passe ne correspondent pas');
      return;
    }
    if (_passCtrl.text.length < 8) {
      setState(() => _error = 'Min. 8 caractères');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await AuthService().resetPassword(
        email: widget.email,
        code: widget.code,
        password: _passCtrl.text,
        confirmPassword: _confirmCtrl.text);
    if (!mounted) return;
    if (result['success'] == true) {
      setState(() {
        _success = 'Mot de passe réinitialisé avec succès !';
        _loading = false;
      });
      await Future.delayed(const Duration(seconds: 2));
      if (mounted)
        Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const LoginScreen()),
            (_) => false);
    } else {
      setState(() {
        _error = result['error'] ?? 'Code invalide ou expiré';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            IconButton(
                icon: const Icon(Icons.arrow_back_ios_new,
                    color: AppColors.textSecondary, size: 18),
                onPressed: () => Navigator.pop(context)),
            const SizedBox(height: 20),

            Center(
                child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFFAF52DE), Color(0xFF58A6FF)]),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                      color: AppColors.primary.withAlpha(80), blurRadius: 25)
                ],
              ),
              child:
                  const Icon(Icons.key_rounded, color: Colors.white, size: 38),
            ).animate().scale(duration: 500.ms, curve: Curves.elasticOut)),

            const SizedBox(height: 24),
            Text('Nouveau mot de passe', style: AppText.heading2)
                .animate()
                .fadeIn(delay: 100.ms),
            const SizedBox(height: 6),
            RichText(
                text: TextSpan(children: [
              TextSpan(text: 'Code validé pour ', style: AppText.bodySecondary),
              TextSpan(
                  text: widget.email,
                  style: GoogleFonts.inter(
                      color: AppColors.primary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600)),
            ])).animate().fadeIn(delay: 150.ms),

            const SizedBox(height: 28),

            if (_error != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppColors.danger.withAlpha(20),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.danger.withAlpha(60))),
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppColors.danger, fontSize: 13)),
              ).animate().shakeX(),

            if (_success != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: AppColors.success.withAlpha(20),
                    borderRadius: BorderRadius.circular(10)),
                child:
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.check_circle_outline,
                      color: AppColors.success),
                  const SizedBox(width: 10),
                  Text(_success!,
                      style: const TextStyle(
                          color: AppColors.success,
                          fontWeight: FontWeight.w600)),
                ]),
              ).animate().scale(),

            AppCard(
                child: Column(children: [
              AppTextField(
                  hint: 'Nouveau mot de passe',
                  controller: _passCtrl,
                  obscure: _obscure1,
                  prefix: const Icon(Icons.lock_outline,
                      color: AppColors.textMuted, size: 18),
                  suffix: IconButton(
                      icon: Icon(
                          _obscure1
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          color: AppColors.textMuted,
                          size: 18),
                      onPressed: () => setState(() => _obscure1 = !_obscure1))),
              const SizedBox(height: 12),
              AppTextField(
                  hint: 'Confirmer le mot de passe',
                  controller: _confirmCtrl,
                  obscure: _obscure2,
                  prefix: const Icon(Icons.lock_outline,
                      color: AppColors.textMuted, size: 18),
                  suffix: IconButton(
                      icon: Icon(
                          _obscure2
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          color: AppColors.textMuted,
                          size: 18),
                      onPressed: () => setState(() => _obscure2 = !_obscure2))),
            ])).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

            const SizedBox(height: 24),
            GradientButton(
                label: 'Réinitialiser le mot de passe',
                loading: _loading,
                onPressed: _success != null ? null : _reset),
          ]),
        ),
      ),
    );
  }
}
