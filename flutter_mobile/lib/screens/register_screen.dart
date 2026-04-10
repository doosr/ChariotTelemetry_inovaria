import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/app_theme.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'verify_email_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure1 = true;
  bool _obscure2 = true;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    if (_passCtrl.text != _confirmCtrl.text) {
      setState(() => _error = 'Les mots de passe ne correspondent pas');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await AuthService().registerSuperAdmin(
        email: _emailCtrl.text.trim(),
        password: _passCtrl.text,
        confirmPassword: _confirmCtrl.text,
        inviteCode: _codeCtrl.text.trim(),
      );
      if (!mounted) return;
      if (response['success'] == true) {
        Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => VerifyEmailScreen(email: _emailCtrl.text.trim()),
            ));
      } else {
        setState(() {
          _error = response['error'] ?? 'Erreur d\'inscription';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Erreur réseau';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(children: [
        Positioned(
            top: -80,
            left: -80,
            child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.primary.withAlpha(12)))),
        SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Form(
                key: _formKey,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Back button
                      IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new,
                            color: AppColors.textSecondary, size: 18),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const SizedBox(height: 12),

                      // Header
                      Text('Créer un compte', style: AppText.heading1)
                          .animate()
                          .fadeIn()
                          .slideY(begin: 0.2),
                      const SizedBox(height: 6),
                      Text('Inscription Super Administrateur',
                              style: AppText.bodySecondary)
                          .animate()
                          .fadeIn(delay: 100.ms),

                      const SizedBox(height: 32),

                      if (_error != null)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                              color: AppColors.danger.withAlpha(20),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: AppColors.danger.withAlpha(60))),
                          child: Row(children: [
                            const Icon(Icons.warning_amber_rounded,
                                color: AppColors.danger, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                                child: Text(_error!,
                                    style: const TextStyle(
                                        color: AppColors.danger,
                                        fontSize: 13))),
                          ]),
                        ).animate().fadeIn().shakeX(),

                      AppCard(
                          child: Column(children: [
                        // Code d'invitation
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withAlpha(15),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: AppColors.primary.withAlpha(40)),
                          ),
                          child: Row(children: [
                            const Icon(Icons.vpn_key_outlined,
                                color: AppColors.primary, size: 16),
                            const SizedBox(width: 10),
                            Expanded(
                                child: Text(
                                    'Un code d\'invitation est requis pour créer un compte Super Admin.',
                                    style: GoogleFonts.inter(
                                        color: AppColors.primary,
                                        fontSize: 12))),
                          ]),
                        ),
                        const SizedBox(height: 16),

                        AppTextField(
                          hint: 'Code d\'invitation *',
                          controller: _codeCtrl,
                          prefix: const Icon(Icons.lock_person_outlined,
                              color: AppColors.textMuted, size: 18),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Code requis' : null,
                        ),
                        const SizedBox(height: 14),
                        AppTextField(
                          hint: 'Adresse email *',
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          prefix: const Icon(Icons.email_outlined,
                              color: AppColors.textMuted, size: 18),
                          validator: (v) => (v == null || !v.contains('@'))
                              ? 'Email invalide'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        AppTextField(
                          hint: 'Mot de passe *',
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
                            onPressed: () =>
                                setState(() => _obscure1 = !_obscure1),
                          ),
                          validator: (v) => (v == null || v.length < 8)
                              ? 'Min 8 caractères'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        AppTextField(
                          hint: 'Confirmer le mot de passe *',
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
                            onPressed: () =>
                                setState(() => _obscure2 = !_obscure2),
                          ),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Requis' : null,
                        ),
                      ])),

                      const SizedBox(height: 24),

                      GradientButton(
                          label: 'Créer mon compte',
                          loading: _loading,
                          onPressed: _register),

                      const SizedBox(height: 16),

                      Center(
                          child: TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: RichText(
                            text: TextSpan(children: [
                          TextSpan(
                              text: 'Déjà un compte ? ',
                              style: GoogleFonts.inter(
                                  color: AppColors.textSecondary,
                                  fontSize: 13)),
                          TextSpan(
                              text: 'Se connecter',
                              style: GoogleFonts.inter(
                                  color: AppColors.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                        ])),
                      )),
                    ])),
          ),
        ),
      ]),
    );
  }
}
