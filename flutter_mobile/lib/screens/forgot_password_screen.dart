import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/app_theme.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'verify_code_screen.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  bool _loading = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_emailCtrl.text.trim().isEmpty || !_emailCtrl.text.contains('@')) {
      setState(() => _error = 'Entrez un email valide');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final email = _emailCtrl.text.trim();
    final result = await AuthService().forgotPassword(email: email);
    if (!mounted) return;
    if (result['success'] == true) {
      if (mounted) setState(() => _loading = false);
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => VerifyCodeScreen(email: email)),
      );
    } else {
      if (mounted) {
        setState(() {
          _error = result['error'] ?? 'Erreur';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(children: [
        Positioned(
            bottom: -100,
            right: -60,
            child: Container(
                width: 260,
                height: 260,
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.warning.withAlpha(10)))),
        SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(children: [
              Row(children: [
                IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new,
                        color: AppColors.textSecondary, size: 18),
                    onPressed: () => Navigator.pop(context)),
              ]),
              const SizedBox(height: 20),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                      colors: [Color(0xFFF97316), Color(0xFFFFC107)]),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: AppColors.warning.withAlpha(80), blurRadius: 25)
                  ],
                ),
                child: const Icon(Icons.lock_reset_rounded,
                    color: Colors.white, size: 38),
              ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
              const SizedBox(height: 24),
              Text('Mot de passe oublié ?',
                      style: AppText.heading2, textAlign: TextAlign.center)
                  .animate()
                  .fadeIn(delay: 100.ms),
              const SizedBox(height: 8),
              Text('Entrez votre email pour recevoir un code de réinitialisation.',
                      style: AppText.bodySecondary, textAlign: TextAlign.center)
                  .animate()
                  .fadeIn(delay: 150.ms),
              const SizedBox(height: 36),
              if (_error != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: AppColors.danger.withAlpha(20),
                      borderRadius: BorderRadius.circular(10),
                      border:
                          Border.all(color: AppColors.danger.withAlpha(60))),
                  child: Text(_error!,
                      style: const TextStyle(
                          color: AppColors.danger, fontSize: 13)),
                ).animate().shakeX(),
              AppCard(
                  child: AppTextField(
                hint: 'Adresse email',
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                prefix: const Icon(Icons.email_outlined,
                    color: AppColors.textMuted, size: 18),
              )).animate().fadeIn(delay: 200.ms).slideY(begin: 0.2),
              const SizedBox(height: 20),
              GradientButton(
                label: 'Envoyer le code',
                gradient: const LinearGradient(
                    colors: [Color(0xFFF97316), Color(0xFFFFC107)]),
                loading: _loading,
                onPressed: _send,
              ).animate().fadeIn(delay: 300.ms),
            ]),
          ),
        ),
      ]),
    );
  }
}
