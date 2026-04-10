import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'home_screen.dart';
import 'register_screen.dart';
import 'forgot_password_screen.dart';
import 'verify_email_screen.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import '../widgets/google_signin_button_selector.dart';

// Global instance to prevent multiple initializations on Web
final GoogleSignIn _googleSignIn = GoogleSignIn(
  clientId:
      '505200443464-kuedj2fg2ieegi66998lqcpg9n8mphjc.apps.googleusercontent.com',
  scopes: ['email', 'profile'],
);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _googleLoading = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Listen for background login (useful for renderButton on Web)
    _googleSignIn.onCurrentUserChanged.listen((account) {
      debugPrint('GOOGLE_SIGN_IN: User changed: ${account?.email}');
      if (account != null) {
        _handleGoogleSignInSuccess(account);
      }
    });

    // Try silent sign-in on init to catch any existing session
    if (kIsWeb) {
      _googleSignIn.signInSilently().then((account) {
        debugPrint('GOOGLE_SIGN_IN: Silent sign-in: ${account?.email}');
      });
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await context
        .read<AuthProvider>()
        .login(_emailCtrl.text.trim(), _passCtrl.text);
    if (!mounted) return;
    if (result['success'] == true) {
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()));
    } else {
      setState(() {
        _error = result['error'];
        _loading = false;
      });
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _googleLoading = true;
      _error = null;
    });
    try {
      // Sign out first to force account picker
      await _googleSignIn.signOut();
      final account = await _googleSignIn.signIn();
      if (account == null) {
        // User cancelled
        setState(() => _googleLoading = false);
        return;
      }
      final result = await AuthService().googleAuth(
        googleId: account.id,
        email: account.email,
        name: account.displayName,
        avatar: account.photoUrl,
      );
      if (!mounted) return;
      _processGoogleAuthResult(result, account.email);
    } on Exception catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      if (msg.contains('sign_in_failed') ||
          msg.contains('platform') ||
          msg.contains('network_error')) {
        _showGoogleConfigDialog();
      } else {
        setState(() {
          _googleLoading = false;
          _error = 'Erreur Google: $e';
        });
      }
    }
  }

  void _showGoogleConfigDialog() async {
    setState(() => _googleLoading = false);
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
                color: const Color(0xFF4285F4).withAlpha(20),
                borderRadius: BorderRadius.circular(8)),
            child: const Text('G',
                style: TextStyle(
                    color: Color(0xFF4285F4),
                    fontSize: 18,
                    fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 12),
          const Expanded(
              child: Text('Configuration Google',
                  style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700))),
        ]),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Google Sign-In n\'est pas encore configuré sur ce mobile :',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              const SizedBox(height: 12),
              const _GoogleSetupStep('1', 'Créez un projet sur console.cloud.google.com'),
              const _GoogleSetupStep('2', 'Ajoutez google-services.json dans android/app/'),
              const _GoogleSetupStep('3', 'Ajoutez GoogleService-Info.plist dans ios/Runner/'),
              const _GoogleSetupStep('4', 'Configurez l\'OAuth avec votre SHA-1 Android'),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                    color: AppColors.warning.withAlpha(15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.warning.withAlpha(50))),
                child: const Text(
                    'Note: Sur Web, vérifiez que l\'URL http://localhost:5000 est autorisée.',
                    style: TextStyle(color: AppColors.warning, fontSize: 12)),
              ),
            ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Compris',
                  style: TextStyle(
                      color: AppColors.primary, fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }

  void _handleGoogleSignInSuccess(GoogleSignInAccount account) async {
    final result = await AuthService().googleAuth(
      googleId: account.id,
      email: account.email,
      name: account.displayName,
      avatar: account.photoUrl,
    );
    if (!mounted) return;
    _processGoogleAuthResult(result, account.email);
  }

  void _processGoogleAuthResult(
      Map<String, dynamic> result, String email) async {
    if (result['success'] == true) {
      await context.read<AuthProvider>().reload();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()));
    } else if (result['needsVerification'] == true) {
      Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => VerifyEmailScreen(
                email: result['email'] ?? email, isGoogleAccount: true),
          ));
    } else {
      setState(() {
        _googleLoading = false;
        _error = result['error'] ?? 'Connexion Google échouée';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF020508), Color(0xFF09050F), Color(0xFF020508)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: Stack(children: [
            Positioned(
                top: -80,
                right: -80,
                child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.primary.withAlpha(12)))),
            Positioned(
                bottom: -80,
                left: -80,
                child: Container(
                    width: 220,
                    height: 220,
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.accent.withAlpha(10)))),
            SafeArea(
              child: SingleChildScrollView(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                child: Form(
                    key: _formKey,
                    child: Column(children: [
                      const SizedBox(height: 40),

                      // Logo
                      Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          gradient: AppColors.gradientPurpleBlue,
                          borderRadius: BorderRadius.circular(26),
                          boxShadow: [
                            BoxShadow(
                                color: AppColors.primary.withAlpha(100),
                                blurRadius: 40,
                                spreadRadius: 3)
                          ],
                        ),
                        child: const Icon(Icons.local_shipping_rounded,
                            color: Colors.white, size: 44),
                      )
                          .animate()
                          .scale(duration: 600.ms, curve: Curves.elasticOut),
                      const SizedBox(height: 20),

                      Text(AppConstants.appName,
                              style: GoogleFonts.inter(
                                  color: Colors.white,
                                  fontSize: 34,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -1))
                          .animate()
                          .fadeIn(delay: 200.ms)
                          .slideY(begin: 0.3),
                      const SizedBox(height: 4),
                      Text('Gestion de Flotte Intelligente',
                              style: AppText.bodySecondary)
                          .animate()
                          .fadeIn(delay: 300.ms),
                      const SizedBox(height: 44),

                      // Error
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

                      // Form card
                      Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          color: AppColors.card.withAlpha(210),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: AppColors.cardBorder),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withAlpha(60),
                                blurRadius: 30,
                                offset: const Offset(0, 10))
                          ],
                        ),
                        child: Column(children: [
                          AppTextField(
                            hint: 'Adresse email',
                            controller: _emailCtrl,
                            keyboardType: TextInputType.emailAddress,
                            prefix: const Icon(Icons.email_outlined,
                                color: AppColors.textMuted, size: 18),
                            validator: (v) => (v == null || !v.contains('@'))
                                ? 'Email invalide'
                                : null,
                          ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.2),
                          const SizedBox(height: 12),
                          AppTextField(
                            hint: 'Mot de passe',
                            controller: _passCtrl,
                            obscure: _obscure,
                            prefix: const Icon(Icons.lock_outline,
                                color: AppColors.textMuted, size: 18),
                            suffix: IconButton(
                              icon: Icon(
                                  _obscure
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                  color: AppColors.textMuted,
                                  size: 18),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                            validator: (v) =>
                                (v == null || v.isEmpty) ? 'Requis' : null,
                          ).animate().fadeIn(delay: 450.ms).slideY(begin: 0.2),

                          // Forgot password link
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          const ForgotPasswordScreen())),
                              style: TextButton.styleFrom(
                                  padding:
                                      const EdgeInsets.only(top: 4, bottom: 4)),
                              child: Text('Mot de passe oublié ?',
                                  style: GoogleFonts.inter(
                                      color: AppColors.accent,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500)),
                            ),
                          ),

                          const SizedBox(height: 8),
                          GradientButton(
                                  label: 'Se connecter',
                                  loading: _loading,
                                  onPressed: _login)
                              .animate()
                              .fadeIn(delay: 550.ms)
                              .slideY(begin: 0.2),

                          // Divider
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Row(children: [
                              const Expanded(
                                  child: Divider(color: AppColors.cardBorder)),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                child: Text('ou', style: AppText.caption),
                              ),
                              const Expanded(
                                  child: Divider(color: AppColors.cardBorder)),
                            ]),
                          ),

                          // Google Sign-In Button
                          kIsWeb
                              ? const GoogleSignInButtonWeb()
                              : SizedBox(
                                  width: double.infinity,
                                  height: 50,
                                  child: OutlinedButton(
                                    onPressed: _googleLoading
                                        ? null
                                        : _signInWithGoogle,
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(
                                          color: AppColors.cardBorder),
                                      shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12)),
                                    ),
                                    child: _googleLoading
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                                color: AppColors.textSecondary,
                                                strokeWidth: 2))
                                        : Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.center,
                                            children: [
                                                _GoogleIcon(),
                                                const SizedBox(width: 10),
                                                Text('Continuer avec Google',
                                                    style: GoogleFonts.inter(
                                                        color: AppColors
                                                            .textPrimary,
                                                        fontSize: 14,
                                                        fontWeight:
                                                            FontWeight.w500)),
                                              ]),
                                  ),
                                ).animate().fadeIn(delay: 650.ms),
                        ]),
                      ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

                      const SizedBox(height: 24),

                      // Register link
                      TextButton(
                        onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const RegisterScreen())),
                        child: RichText(
                            text: TextSpan(children: [
                          TextSpan(
                              text: 'Pas encore de compte ? ',
                              style:
                                  AppText.bodySecondary.copyWith(fontSize: 13)),
                          TextSpan(
                              text: 'Créer un compte',
                              style: GoogleFonts.inter(
                                  color: AppColors.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700)),
                        ])),
                      ).animate().fadeIn(delay: 700.ms),

                      const SizedBox(height: 12),
                      Text('© 2026 IntelliMetry · Tous droits réservés',
                              style: AppText.caption)
                          .animate()
                          .fadeIn(delay: 800.ms),
                    ])),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _GoogleIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration:
          const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
      child: Center(
        child: Text('G',
            style: GoogleFonts.inter(
                color: Color(0xFF4285F4),
                fontSize: 13,
                fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _GoogleSetupStep extends StatelessWidget {
  final String number, text;
  const _GoogleSetupStep(this.number, this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(
                color: AppColors.primary, shape: BoxShape.circle),
            child: Center(
                child: Text(number,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 8),
          Expanded(
              child: Text(text,
                  style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 12))),
        ]),
      );
}
