import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/common_widgets.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _showChangePassword = false;
  final _currentPwdCtrl = TextEditingController();
  final _newPwdCtrl = TextEditingController();
  final _confirmPwdCtrl = TextEditingController();
  bool _pwdLoading = false;
  String? _pwdError;
  String? _pwdSuccess;

  @override
  void dispose() {
    _currentPwdCtrl.dispose();
    _newPwdCtrl.dispose();
    _confirmPwdCtrl.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (_newPwdCtrl.text != _confirmPwdCtrl.text) {
      setState(() => _pwdError = 'Les mots de passe ne correspondent pas');
      return;
    }
    setState(() {
      _pwdLoading = true;
      _pwdError = null;
      _pwdSuccess = null;
    });
    final result = await context
        .read<AuthProvider>()
        .changePassword(_currentPwdCtrl.text, _newPwdCtrl.text);
    if (!mounted) return;
    if (result['success'] == true) {
      setState(() {
        _pwdSuccess = 'Mot de passe modifié avec succès !';
        _pwdLoading = false;
        _showChangePassword = false;
      });
      _currentPwdCtrl.clear();
      _newPwdCtrl.clear();
      _confirmPwdCtrl.clear();
    } else {
      setState(() {
        _pwdError = result['error'] ?? 'Erreur';
        _pwdLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final name = auth.userName;
    final email = auth.userEmail;
    final role = auth.userRole;
    final initial = (name.isNotEmpty ? name[0] : '?').toUpperCase();
    final roleColor = AppRoles.color(role);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: CustomScrollView(slivers: [
        SliverAppBar(
          expandedHeight: 280,
          pinned: true,
          backgroundColor: AppColors.bg,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [roleColor.withAlpha(40), Colors.transparent],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: SafeArea(
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 20),
                      // Avatar
                      Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          gradient: AppColors.gradientPurpleBlue,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                                color: AppColors.primary.withAlpha(100),
                                blurRadius: 30,
                                spreadRadius: 3)
                          ],
                        ),
                        child: Center(
                            child: Text(initial,
                                style: GoogleFonts.inter(
                                    color: Colors.white,
                                    fontSize: 38,
                                    fontWeight: FontWeight.w900))),
                      )
                          .animate()
                          .scale(duration: 600.ms, curve: Curves.elasticOut),
                      const SizedBox(height: 14),
                      Text(name, style: AppText.heading2)
                          .animate()
                          .fadeIn(delay: 100.ms),
                      const SizedBox(height: 4),
                      Text(email, style: AppText.bodySecondary)
                          .animate()
                          .fadeIn(delay: 150.ms),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 5),
                        decoration: BoxDecoration(
                            gradient: AppColors.gradientPurpleBlue,
                            borderRadius: BorderRadius.circular(20)),
                        child: Text(AppRoles.label(role),
                            style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w700)),
                      ).animate().fadeIn(delay: 200.ms),
                    ]),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          sliver: SliverList(
              delegate: SliverChildListDelegate([
            // Account Info
            _Section(
                title: '👤 Mon compte',
                child: AppCard(
                    child: Column(children: [
                  _ProfRow(
                      icon: Icons.person_outline,
                      label: 'Nom',
                      value: name.isEmpty ? '—' : name),
                  const Divider(color: AppColors.divider, height: 1),
                  _ProfRow(
                      icon: Icons.email_outlined, label: 'Email', value: email),
                  const Divider(color: AppColors.divider, height: 1),
                  _ProfRow(
                      icon: Icons.badge_outlined,
                      label: 'Rôle',
                      value: AppRoles.label(role)),
                ]))).animate().fadeIn(delay: 200.ms).slideY(begin: 0.2),

            // Change Password
            _Section(
                title: '🔐 Sécurité',
                child: Column(children: [
                  if (_pwdSuccess != null)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: AppColors.success.withAlpha(20),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: AppColors.success.withAlpha(60))),
                      child: Text(_pwdSuccess!,
                          style: const TextStyle(color: AppColors.success)),
                    ),
                  GestureDetector(
                    onTap: () => setState(
                        () => _showChangePassword = !_showChangePassword),
                    child: AppCard(
                        child: Row(children: [
                      const Icon(Icons.lock_outlined,
                          color: AppColors.textSecondary, size: 18),
                      const SizedBox(width: 12),
                      const Expanded(
                          child: Text('Changer le mot de passe',
                              style: TextStyle(
                                  color: AppColors.textPrimary, fontSize: 14))),
                      Icon(
                          _showChangePassword
                              ? Icons.keyboard_arrow_up
                              : Icons.keyboard_arrow_down,
                          color: AppColors.textMuted),
                    ])),
                  ),
                  if (_showChangePassword)
                    AppCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(children: [
                        if (_pwdError != null)
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                                color: AppColors.danger.withAlpha(20),
                                borderRadius: BorderRadius.circular(8)),
                            child: Text(_pwdError!,
                                style: const TextStyle(
                                    color: AppColors.danger, fontSize: 12)),
                          ),
                        AppTextField(
                            hint: 'Mot de passe actuel',
                            controller: _currentPwdCtrl,
                            obscure: true,
                            prefix: const Icon(Icons.lock_outline,
                                color: AppColors.textMuted, size: 18)),
                        const SizedBox(height: 10),
                        AppTextField(
                            hint: 'Nouveau mot de passe',
                            controller: _newPwdCtrl,
                            obscure: true,
                            prefix: const Icon(Icons.lock_reset,
                                color: AppColors.textMuted, size: 18)),
                        const SizedBox(height: 10),
                        AppTextField(
                            hint: 'Confirmer le nouveau mot de passe',
                            controller: _confirmPwdCtrl,
                            obscure: true,
                            prefix: const Icon(Icons.lock_reset,
                                color: AppColors.textMuted, size: 18)),
                        const SizedBox(height: 14),
                        GradientButton(
                            label: 'Enregistrer',
                            loading: _pwdLoading,
                            onPressed: _changePassword,
                            height: 44),
                      ]),
                    ).animate().fadeIn().slideY(begin: -0.1),
                ])).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

            // App Info
            _Section(
                title: '📱 Application',
                child: AppCard(
                    child: Column(children: [
                  _ProfRow(
                      icon: Icons.info_outline,
                      label: 'Version',
                      value: '1.0.0'),
                  const Divider(color: AppColors.divider, height: 1),
                  _ProfRow(
                      icon: Icons.dns_outlined,
                      label: 'Serveur',
                      value: AppConstants.baseUrl
                          .replaceAll('http://', '')
                          .split('/')
                          .first),
                ]))).animate().fadeIn(delay: 400.ms).slideY(begin: 0.2),

            const SizedBox(height: 24),

            // Logout
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.logout_rounded, color: AppColors.danger),
                label: Text('Déconnexion',
                    style: GoogleFonts.inter(
                        color: AppColors.danger,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.danger, width: 1.5),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () async {
                  final ok = await showConfirm(context,
                      title: 'Déconnexion',
                      content: 'Voulez-vous vous déconnecter ?',
                      confirmLabel: 'Déconnecter',
                      confirmColor: AppColors.danger);
                  if (ok == true && context.mounted) {
                    await context.read<AuthProvider>().logout();
                    if (context.mounted)
                      Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(
                              builder: (_) => const LoginScreen()),
                          (_) => false);
                  }
                },
              ),
            ).animate().fadeIn(delay: 500.ms),
          ])),
        ),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
            padding: const EdgeInsets.only(top: 20, bottom: 10),
            child: Text(title, style: AppText.heading3)),
        child,
      ]);
}

class _ProfRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _ProfRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          Icon(icon, color: AppColors.primary, size: 18),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(label, style: AppText.caption),
                const SizedBox(height: 2),
                Text(value,
                    style: AppText.body.copyWith(fontWeight: FontWeight.w600)),
              ])),
        ]),
      );
}
