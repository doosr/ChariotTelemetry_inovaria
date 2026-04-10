import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../core/app_theme.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'reset_password_screen.dart';

class VerifyCodeScreen extends StatefulWidget {
  final String email;
  const VerifyCodeScreen({super.key, required this.email});
  @override
  State<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends State<VerifyCodeScreen> {
  String _code = '';
  bool _loading = false;
  String? _error;

  Future<void> _verify() async {
    if (_code.length != 6) {
      setState(() => _error = 'Entrez le code à 6 chiffres');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await AuthService().checkResetCode(widget.email, _code);
    if (!mounted) return;
    if (result['success'] == true) {
      Navigator.pushReplacement(
          context,
          MaterialPageRoute(
              builder: (_) => ResetPasswordScreen(email: widget.email, code: _code)));
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            IconButton(
                icon: const Icon(Icons.arrow_back_ios_new, color: AppColors.textSecondary, size: 18),
                onPressed: () => Navigator.pop(context)),
            const SizedBox(height: 20),
            Center(
                child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFF97316), Color(0xFFFFC107)]),
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: AppColors.warning.withAlpha(80), blurRadius: 25)],
              ),
              child: const Icon(Icons.mark_email_read_rounded, color: Colors.white, size: 38),
            ).animate().scale(duration: 500.ms, curve: Curves.elasticOut)),
            const SizedBox(height: 24),
            Text('Vérification', style: AppText.heading2).animate().fadeIn(delay: 100.ms),
            const SizedBox(height: 6),
            RichText(
                text: TextSpan(children: [
              TextSpan(text: 'Code envoyé à ', style: AppText.bodySecondary),
              TextSpan(
                  text: widget.email,
                  style: GoogleFonts.inter(color: AppColors.warning, fontSize: 14, fontWeight: FontWeight.w600)),
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
                child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              ).animate().shakeX(),
            Text('Code de sécurité (6 chiffres)', style: AppText.label.copyWith(fontSize: 12)),
            const SizedBox(height: 10),
            PinCodeTextField(
              appContext: context,
              length: 6,
              onChanged: (v) => _code = v,
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
                activeColor: AppColors.warning,
                selectedColor: AppColors.warning,
                inactiveColor: AppColors.cardBorder,
              ),
              enableActiveFill: true,
              textStyle: GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.w800),
            ).animate().fadeIn(delay: 200.ms),
            const SizedBox(height: 24),
            GradientButton(
                label: 'Vérifier le code',
                gradient: const LinearGradient(colors: [Color(0xFFF97316), Color(0xFFFFC107)]),
                loading: _loading,
                onPressed: _verify),
          ]),
        ),
      ),
    );
  }
}
