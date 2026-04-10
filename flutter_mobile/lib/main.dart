import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/app_theme.dart';
import 'providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: AppColors.bgCard,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const IntelliMetryApp());
}

class IntelliMetryApp extends StatelessWidget {
  const IntelliMetryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [ChangeNotifierProvider(create: (_) => AuthProvider())],
      child: MaterialApp(
        title: AppConstants.appName,
        theme: AppTheme.dark,
        debugShowCheckedModeBanner: false,
        home: const _SplashGate(),
      ),
    );
  }
}

class _SplashGate extends StatefulWidget {
  const _SplashGate();

  @override
  State<_SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<_SplashGate> {
  bool _checkingPrefs = true;
  bool _onboardingDone = false;

  @override
  void initState() {
    super.initState();
    _checkOnboarding();
  }

  Future<void> _checkOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    final done = prefs.getBool('onboarding_done') ?? false;
    if (mounted)
      setState(() {
        _onboardingDone = done;
        _checkingPrefs = false;
      });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    // Still loading prefs or auth
    if (_checkingPrefs || auth.isLoading) {
      return Scaffold(
        backgroundColor: AppColors.bg,
        body: Stack(children: [
          Positioned(
              top: -80, right: -80, child: _glow(AppColors.primary, 260)),
          Positioned(
              bottom: -80, left: -60, child: _glow(AppColors.accent, 240)),
          Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  gradient: AppColors.gradientPurpleBlue,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                        color: AppColors.primary.withAlpha(120),
                        blurRadius: 40,
                        spreadRadius: 5)
                  ],
                ),
                child: const Icon(Icons.local_shipping_rounded,
                    color: Colors.white, size: 46),
              ).animate(onPlay: (c) => c.repeat()).shimmer(
                  duration: 1400.ms, color: Colors.white.withAlpha(60)),
              const SizedBox(height: 22),
              Text(AppConstants.appName,
                  style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1)),
              const SizedBox(height: 6),
              Text('Chargement...', style: AppText.bodySecondary),
            ]),
          ),
        ]),
      );
    }

    // Show onboarding on first launch
    if (!_onboardingDone) return const OnboardingScreen();

    // Route based on auth state
    return auth.isLoggedIn ? const HomeScreen() : const LoginScreen();
  }
}

Widget _glow(Color color, double size) => Container(
      width: size,
      height: size,
      decoration:
          BoxDecoration(shape: BoxShape.circle, color: color.withAlpha(12)),
    );
