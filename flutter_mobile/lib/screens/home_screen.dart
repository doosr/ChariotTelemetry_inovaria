import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';
import '../widgets/global_alert_overlay.dart';
import 'dashboard_screen.dart';
import 'fleet_screen.dart';
import 'map_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'users_screen.dart';
import 'maintenance_screen.dart';
import 'login_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  Timer? _alertTimer;
  final ApiService _api = ApiService();
  String? _activeAlertId;

  @override
  void initState() {
    super.initState();
    _startAlertPolling();
  }

  void _startAlertPolling() {
    _alertTimer = Timer.periodic(const Duration(seconds: 15), (timer) async {
      if (!mounted) return;
      try {
        final data = await _api.getNotifications(limit: 5); 
        if (!mounted) return;
        if (data is List) {
          final dangerAlerts = data.where((n) {
            return n['type'] == 'danger' && n['read'] == false;
          }).toList();
          if (dangerAlerts.isNotEmpty) {
            final firstAlert = dangerAlerts.first;
            final alertId = firstAlert['_id'];
            if (_activeAlertId != alertId) {
              _activeAlertId = alertId;
              if (mounted) {
                GlobalAlertManager.show(context, {
                  'title': firstAlert['title'] ?? 'ALERTE',
                  'message': firstAlert['message'] ?? 'Problème détecté',
                });
              }
            }
          } else {
            GlobalAlertManager.hide();
            _activeAlertId = null;
          }
        }
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _alertTimer?.cancel();
    GlobalAlertManager.hide();
    super.dispose();
  }

  List<_NavDef> _navItems(AuthProvider auth) {
    final items = <_NavDef>[
      const _NavDef(
          icon: Icons.dashboard_outlined,
          active: Icons.dashboard_rounded,
          label: 'Dashboard',
          screen: DashboardScreen()),
      const _NavDef(
          icon: Icons.local_shipping_outlined,
          active: Icons.local_shipping_rounded,
          label: 'Flotte',
          screen: FleetScreen()),
      const _NavDef(
          icon: Icons.map_outlined,
          active: Icons.map_rounded,
          label: 'Carte',
          screen: MapScreen()),
    ];
    if (auth.isAdminOrAbove) {
      items.add(const _NavDef(
          icon: Icons.people_outline,
          active: Icons.people_rounded,
          label: 'Équipe',
          screen: UsersScreen()));
    }
    items.add(const _NavDef(
        icon: Icons.notifications_outlined,
        active: Icons.notifications_rounded,
        label: 'Alertes',
        screen: NotificationsScreen()));
    items.add(const _NavDef(
        icon: Icons.person_outline,
        active: Icons.person_rounded,
        label: 'Profil',
        screen: ProfileScreen()));
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final items = _navItems(auth);
    final safeIndex = _index.clamp(0, items.length - 1);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.bg,
        // ── Sidebar Drawer ─────────────────────────────────────────────────
        drawer: _AppDrawer(
          currentIndex: safeIndex,
          items: items,
          onSelect: (i) {
            setState(() => _index = i);
            _scaffoldKey.currentState?.closeDrawer();
          },
          auth: auth,
        ),
        // ── Body ────────────────────────────────────────────────────────────
        body: IndexedStack(
          index: safeIndex,
          children: items.map((e) => e.screen).toList(),
        ),
        // ── Bottom Navigation ────────────────────────────────────────────────
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: AppColors.bgCard,
            border: const Border(top: BorderSide(color: AppColors.divider)),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withAlpha(80),
                  blurRadius: 20,
                  offset: const Offset(0, -5))
            ],
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  // ── Hamburger button (≡) opens the sidebar
                  _HamburgerButton(
                      onTap: () => _scaffoldKey.currentState?.openDrawer()),

                  // ── Vertical separator
                  Container(width: 1, height: 32, color: AppColors.divider),

                  // ── Navigation items
                  ...items.asMap().entries.map((e) {
                    final i = e.key;
                    final item = e.value;
                    final isActive = safeIndex == i;
                    return Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _index = i),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(
                              vertical: 8, horizontal: 4),
                          decoration: BoxDecoration(
                            gradient:
                                isActive ? AppColors.gradientPurpleBlue : null,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(
                              isActive ? item.active : item.icon,
                              color:
                                  isActive ? Colors.white : AppColors.textMuted,
                              size: 22,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              item.label,
                              style: GoogleFonts.inter(
                                color: isActive
                                    ? Colors.white
                                    : AppColors.textMuted,
                                fontSize: 10,
                                fontWeight: isActive
                                    ? FontWeight.w700
                                    : FontWeight.normal,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ]),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Hamburger Button ──────────────────────────────────────────────────────────

class _HamburgerButton extends StatelessWidget {
  final VoidCallback onTap;
  const _HamburgerButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _HLine(width: 22),
          const SizedBox(height: 5),
          _HLine(width: 16),
          const SizedBox(height: 5),
          _HLine(width: 22),
          const SizedBox(height: 3),
          Text('Menu',
              style:
                  GoogleFonts.inter(color: AppColors.textMuted, fontSize: 10)),
        ]),
      ),
    );
  }
}

class _HLine extends StatelessWidget {
  final double width;
  const _HLine({required this.width});

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: 2,
        decoration: BoxDecoration(
          color: AppColors.textMuted,
          borderRadius: BorderRadius.circular(2),
        ),
      );
}

// ── Sidebar Drawer ────────────────────────────────────────────────────────────

class _AppDrawer extends StatelessWidget {
  final int currentIndex;
  final List<_NavDef> items;
  final void Function(int) onSelect;
  final AuthProvider auth;

  const _AppDrawer({
    required this.currentIndex,
    required this.items,
    required this.onSelect,
    required this.auth,
  });

  @override
  Widget build(BuildContext context) {
    final roleColor = AppRoles.color(auth.userRole);
    final initial =
        (auth.userName.isNotEmpty ? auth.userName[0] : '?').toUpperCase();

    return Drawer(
      backgroundColor: AppColors.bgCard,
      width: MediaQuery.of(context).size.width * 0.82,
      child: SafeArea(
        child: Column(children: [
          // ── Header avec avatar et rôle
          Container(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [roleColor.withAlpha(35), Colors.transparent],
                end: Alignment.bottomCenter,
              ),
            ),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    gradient: AppColors.gradientPurpleBlue,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                          color: AppColors.primary.withAlpha(90),
                          blurRadius: 18)
                    ],
                  ),
                  child: Center(
                    child: Text(initial,
                        style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w900)),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(
                        auth.userName.split('@').first,
                        style: AppText.heading3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 5),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: roleColor.withAlpha(25),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: roleColor.withAlpha(70)),
                        ),
                        child: Text(
                          AppRoles.label(auth.userRole),
                          style: GoogleFonts.inter(
                              color: roleColor,
                              fontSize: 10,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ])),
              ]),
              const SizedBox(height: 8),
              Text(auth.userEmail,
                  style: AppText.caption, overflow: TextOverflow.ellipsis),
            ]),
          ),

          const Divider(color: AppColors.divider, height: 1),

          // ── Navigation
          Expanded(
            child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  _DrawerSection(title: 'PRINCIPAL'),
                  // Bottom nav screens
                  ...items.asMap().entries.map((e) => _DrawerNavItem(
                        icon: e.value.active,
                        label: e.value.label,
                        isActive: currentIndex == e.key,
                        onTap: () => onSelect(e.key),
                      )),

                  // Extra pages (accessible but not in bottom nav)
                  if (auth.isAdminOrAbove) ...[
                    const SizedBox(height: 6),
                    _DrawerSection(title: 'GESTION'),
                    _DrawerNavItem(
                      icon: Icons.build_rounded,
                      label: 'Maintenance',
                      isActive: false,
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const MaintenanceScreen()));
                      },
                    ),
                  ],
                ]),
          ),

          const Divider(color: AppColors.divider, height: 1),

          // ── Déconnexion
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              SizedBox(
                width: double.infinity,
                height: 46,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.logout_rounded,
                      color: AppColors.danger, size: 17),
                  label: Text('Déconnexion',
                      style: GoogleFonts.inter(
                          color: AppColors.danger,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.danger, width: 1.2),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () async {
                    final nav = Navigator.of(context);
                    final authProv = context.read<AuthProvider>();
                    nav.pop(); // close drawer
                    final ok = await showConfirm(context,
                        title: 'Déconnexion',
                        content: 'Voulez-vous vous déconnecter ?',
                        confirmLabel: 'Déconnecter');
                    if (ok == true && context.mounted) {
                      await authProv.logout();
                      if (context.mounted) {
                        nav.pushAndRemoveUntil(
                          MaterialPageRoute(
                              builder: (_) => const LoginScreen()),
                          (_) => false,
                        );
                      }
                    }
                  },
                ),
              ),
              const SizedBox(height: 6),
              Text('IntelliMetry v${AppConstants.version}',
                  style: AppText.caption),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _DrawerSection extends StatelessWidget {
  final String title;
  const _DrawerSection({required this.title});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
        child: Text(title,
            style: GoogleFonts.inter(
                color: AppColors.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2)),
      );
}

class _DrawerNavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  const _DrawerNavItem(
      {required this.icon,
      required this.label,
      required this.isActive,
      required this.onTap});

  @override
  Widget build(BuildContext context) => ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        tileColor: isActive ? AppColors.primary.withAlpha(15) : null,
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            gradient: isActive ? AppColors.gradientPurpleBlue : null,
            color: isActive ? null : AppColors.card,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon,
              color: isActive ? Colors.white : AppColors.textSecondary,
              size: 18),
        ),
        title: Text(
          label,
          style: GoogleFonts.inter(
            color: isActive ? AppColors.textPrimary : AppColors.textSecondary,
            fontSize: 14,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.normal,
          ),
        ),
        trailing: isActive
            ? Container(
                width: 4,
                height: 24,
                decoration: BoxDecoration(
                    gradient: AppColors.gradientPurpleBlue,
                    borderRadius: BorderRadius.circular(4)))
            : null,
      );
}

// ── NavDef ────────────────────────────────────────────────────────────────────

class _NavDef {
  final IconData icon;
  final IconData active;
  final String label;
  final Widget screen;
  const _NavDef(
      {required this.icon,
      required this.active,
      required this.label,
      required this.screen});
}
