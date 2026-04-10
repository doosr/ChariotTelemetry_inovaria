import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/app_theme.dart';
import '../widgets/common_widgets.dart';
import 'login_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _ctrl = PageController();
  int _page = 0;

  static const List<_OnboardPage> _pages = [
    _OnboardPage(
      icon: Icons.local_shipping_rounded,
      gradient: AppColors.gradientPurpleBlue,
      title: 'Bienvenue dans\nIntelliMetry',
      subtitle:
          'La plateforme intelligente de gestion de flotte industrielle, accessible partout.',
    ),
    _OnboardPage(
      icon: Icons.dashboard_rounded,
      gradient: AppColors.gradientTeal,
      title: 'Tableau de bord\nen temps réel',
      subtitle:
          'Suivez la télémétrie, le carburant et l\'état de tous vos chariots en direct.',
    ),
    _OnboardPage(
      icon: Icons.notifications_active_rounded,
      gradient: AppColors.gradientOrange,
      title: 'Alertes\nintelligentes',
      subtitle:
          'Recevez des notifications instantanées pour chaque anomalie détectée.',
    ),
    _OnboardPage(
      icon: Icons.people_rounded,
      gradient: AppColors.gradientPurpleBlue,
      title: 'Gestion\nd\'équipe',
      subtitle:
          'Gérez vos administrateurs et techniciens directement depuis votre téléphone.',
    ),
  ];

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_done', true);
    if (mounted) {
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(children: [
        // Background glow
        Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.primary.withAlpha(12)),
            )),
        Positioned(
            bottom: -80,
            left: -60,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.accent.withAlpha(10)),
            )),

        SafeArea(
          child: Column(children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: TextButton(
                onPressed: _finish,
                child: Text('Passer',
                    style: GoogleFonts.inter(
                        color: AppColors.textMuted, fontSize: 14)),
              ),
            ),

            // PageView
            Expanded(
              child: PageView.builder(
                controller: _ctrl,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _pages.length,
                itemBuilder: (_, i) => _OnboardPageWidget(page: _pages[i]),
              ),
            ),

            // Dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                  _pages.length,
                  (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: _page == i ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          gradient:
                              _page == i ? AppColors.gradientPurpleBlue : null,
                          color: _page == i ? null : AppColors.cardBorder,
                        ),
                      )),
            ),
            const SizedBox(height: 32),

            // Button
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
              child: GradientButton(
                label: _page == _pages.length - 1 ? 'Commencer' : 'Suivant',
                gradient: _pages[_page].gradient,
                onPressed: () {
                  if (_page < _pages.length - 1) {
                    _ctrl.nextPage(
                        duration: const Duration(milliseconds: 400),
                        curve: Curves.easeInOut);
                  } else {
                    _finish();
                  }
                },
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _OnboardPage {
  final IconData icon;
  final LinearGradient gradient;
  final String title;
  final String subtitle;
  const _OnboardPage(
      {required this.icon,
      required this.gradient,
      required this.title,
      required this.subtitle});
}

class _OnboardPageWidget extends StatelessWidget {
  final _OnboardPage page;
  const _OnboardPageWidget({super.key, required this.page});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 140,
          height: 140,
          decoration: BoxDecoration(
              gradient: page.gradient,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                    color: page.gradient.colors.first.withAlpha(90),
                    blurRadius: 50,
                    spreadRadius: 5)
              ]),
          child: Icon(page.icon, color: Colors.white, size: 68),
        ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
        const SizedBox(height: 48),
        Text(page.title,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                    height: 1.2))
            .animate()
            .fadeIn(delay: 100.ms)
            .slideY(begin: 0.2),
        const SizedBox(height: 16),
        Text(page.subtitle,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                    color: AppColors.textSecondary, fontSize: 16, height: 1.6))
            .animate()
            .fadeIn(delay: 200.ms),
      ]),
    );
  }
}
