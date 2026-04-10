import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../core/app_theme.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'home_screen.dart';

class VerifyEmailScreen extends StatefulWidget {
  final String email;
  final bool isGoogleAccount;
  const VerifyEmailScreen(
      {super.key, required this.email, this.isGoogleAccount = false});
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  String _code = '';
  bool _loading = false;
  bool _resending = false;
  String? _error;
  String? _success;

  Future<void> _verify() async {
    if (_code.length != 6) {
      setState(() => _error = 'Entrez le code à 6 chiffres');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final result =
        await AuthService().verifyEmail(email: widget.email, code: _code);
    if (!mounted) return;
    if (result['success'] == true) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
        (_) => false,
      );
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
      body: Stack(children: [
        Positioned(
            top: -80,
            right: -80,
            child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.teal.withAlpha(12)))),
        SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Row(children: [
                    IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new,
                            color: AppColors.textSecondary, size: 18),
                        onPressed: () => Navigator.pop(context)),
                  ]),
                  const SizedBox(height: 20),

                  // Icon
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                        gradient: AppColors.gradientTeal,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                              color: AppColors.teal.withAlpha(80),
                              blurRadius: 25)
                        ]),
                    child: const Icon(Icons.mark_email_read_rounded,
                        color: Colors.white, size: 38),
                  ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),

                  const SizedBox(height: 24),

                  Text('Vérifiez votre email',
                          style: AppText.heading2, textAlign: TextAlign.center)
                      .animate()
                      .fadeIn(delay: 100.ms),
                  const SizedBox(height: 10),
                  RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(children: [
                      TextSpan(
                          text: 'Un code à 6 chiffres a été envoyé à\n',
                          style: AppText.bodySecondary),
                      TextSpan(
                          text: widget.email,
                          style: GoogleFonts.inter(
                              color: AppColors.primary,
                              fontSize: 14,
                              fontWeight: FontWeight.w700)),
                    ]),
                  ).animate().fadeIn(delay: 150.ms),

                  const SizedBox(height: 40),

                  if (_error != null)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: AppColors.danger.withAlpha(20),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: AppColors.danger.withAlpha(60))),
                      child: Text(_error!,
                          style: const TextStyle(
                              color: AppColors.danger, fontSize: 13),
                          textAlign: TextAlign.center),
                    ).animate().fadeIn().shakeX(),

                  if (_success != null)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: AppColors.success.withAlpha(20),
                          borderRadius: BorderRadius.circular(10)),
                      child: Text(_success!,
                          style: const TextStyle(
                              color: AppColors.success, fontSize: 13),
                          textAlign: TextAlign.center),
                    ),

                  // PIN input
                  PinCodeTextField(
                    appContext: context,
                    length: 6,
                    onChanged: (v) => _code = v,
                    onCompleted: (v) {
                      _code = v;
                      _verify();
                    },
                    keyboardType: TextInputType.number,
                    animationType: AnimationType.fade,
                    pinTheme: PinTheme(
                      shape: PinCodeFieldShape.box,
                      borderRadius: BorderRadius.circular(12),
                      fieldHeight: 56,
                      fieldWidth: 46,
                      activeFillColor: AppColors.card,
                      selectedFillColor: AppColors.card,
                      inactiveFillColor: AppColors.bgCard,
                      activeColor: AppColors.primary,
                      selectedColor: AppColors.primary,
                      inactiveColor: AppColors.cardBorder,
                    ),
                    enableActiveFill: true,
                    textStyle: GoogleFonts.inter(
                        color: AppColors.textPrimary,
                        fontSize: 20,
                        fontWeight: FontWeight.w800),
                  ).animate().fadeIn(delay: 200.ms),

                  const SizedBox(height: 24),

                  GradientButton(
                    label: 'Vérifier le code',
                    gradient: AppColors.gradientTeal,
                    loading: _loading,
                    onPressed: _verify,
                  ),

                  const SizedBox(height: 20),

                  // Resend
                  TextButton(
                    onPressed:
                        _resending ? null : null, // Toast indication only
                    child: _resending
                        ? const CircularProgressIndicator(
                            color: AppColors.primary, strokeWidth: 2)
                        : RichText(
                            text: TextSpan(children: [
                            TextSpan(
                                text: 'Vous n\'avez pas reçu le code ? ',
                                style: AppText.bodySecondary),
                            TextSpan(
                                text: 'Renvoyer',
                                style: GoogleFonts.inter(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w600)),
                          ])),
                  ),
                ]),
          ),
        ),
      ]),
    );
  }
}
