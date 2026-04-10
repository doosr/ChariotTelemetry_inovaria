import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';
import 'machine_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _machines = [];
  List<dynamic> _notifications = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _fetch();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _fetch());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    final machines = await _api.getMachines(
      ownerId: auth.isTechnician
          ? null
          : (auth.userId.isNotEmpty ? auth.userId : null),
      role: auth.userRole,
      technicianId: auth.isTechnician ? auth.userId : null,
    );
    final notifs = await _api.getNotifications(limit: 5);
    if (mounted)
      setState(() {
        _machines = machines;
        _notifications = notifs;
        _loading = false;
      });
  }

  int get _online => _machines.where((m) => m['status'] == 'online').length;
  int get _offline => _machines.length - _online;
  int get _running =>
      _machines.where((m) => m['trip']?['isRunning'] == true).length;
  int get _unreadNotifs =>
      _notifications.where((n) => n['read'] != true).length;

  double get _avgFuel {
    final fueled = _machines.where((m) {
      final t = m['telemetry'];
      return t?['fuel_percent'] != null || m['health']?['fuel'] != null;
    }).toList();
    if (fueled.isEmpty) return 0;
    double total = 0;
    for (final m in fueled) {
      final t = m['telemetry'];
      final f = t?['fuel_percent'] ?? m['health']?['fuel'] ?? 0;
      total += double.tryParse('$f') ?? 0;
    }
    return total / fueled.length;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Bonjour'
        : hour < 18
            ? 'Bon après-midi'
            : 'Bonsoir';

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          // ── App Bar
          SliverAppBar(
            expandedHeight: 180,
            pinned: true,
            backgroundColor: AppColors.bg,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary.withAlpha(30),
                      Colors.transparent
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                        gradient: AppColors.gradientPurpleBlue,
                                        borderRadius:
                                            BorderRadius.circular(10)),
                                    child: const Icon(
                                        Icons.local_shipping_rounded,
                                        color: Colors.white,
                                        size: 16),
                                  ),
                                  const SizedBox(width: 8),
                                  Text('IntelliMetry',
                                      style: GoogleFonts.inter(
                                          color: Colors.white,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w800)),
                                ]),
                                // Notification bell
                                Stack(children: [
                                  Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                        color: AppColors.card,
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                            color: AppColors.cardBorder)),
                                    child: const Icon(
                                        Icons.notifications_outlined,
                                        color: AppColors.textSecondary,
                                        size: 20),
                                  ),
                                  if (_unreadNotifs > 0)
                                    Positioned(
                                        right: 0,
                                        top: 0,
                                        child: Container(
                                          width: 16,
                                          height: 16,
                                          decoration: BoxDecoration(
                                              gradient:
                                                  AppColors.gradientOrange,
                                              shape: BoxShape.circle),
                                          child: Center(
                                              child: Text('$_unreadNotifs',
                                                  style: const TextStyle(
                                                      color: Colors.white,
                                                      fontSize: 9,
                                                      fontWeight:
                                                          FontWeight.w700))),
                                        )),
                                ]),
                              ]),
                          const SizedBox(height: 18),
                          Text('$greeting,',
                              style: AppText.caption.copyWith(fontSize: 13)),
                          const SizedBox(height: 2),
                          Text(auth.userName.split('@').first,
                              style: AppText.heading1),
                          const SizedBox(height: 4),
                          StatusBadge(
                              label: AppRoles.label(auth.userRole),
                              color: AppRoles.color(auth.userRole)),
                        ]),
                  ),
                ),
              ),
            ),
          ),

          if (_loading)
            const SliverFillRemaining(child: LoadingOverlay())
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              sliver: SliverList(
                  delegate: SliverChildListDelegate([
                const SizedBox(height: 4),

                // ── Stats Grid
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.4,
                  children: [
                    StatCard(
                        label: 'Chariots total',
                        value: '${_machines.length}',
                        icon: Icons.inventory_2_rounded,
                        gradient: AppColors.gradientPurpleBlue),
                    StatCard(
                        label: 'En ligne',
                        value: '$_online',
                        icon: Icons.wifi_rounded,
                        gradient: AppColors.gradientTeal,
                        subtitle: 'ACTIF'),
                    StatCard(
                        label: 'Hors ligne',
                        value: '$_offline',
                        icon: Icons.wifi_off_rounded,
                        gradient: AppColors.gradientOrange,
                        subtitle: 'INACTIF'),
                    StatCard(
                        label: 'En trajet',
                        value: '$_running',
                        icon: Icons.directions_run_rounded,
                        gradient: const LinearGradient(
                            colors: [Color(0xFF7B2FBE), Color(0xFFAF52DE)])),
                  ],
                ).animate().fadeIn(delay: 100.ms).slideY(begin: 0.2),

                const SizedBox(height: 20),

                // ── Fuel Overview
                AppCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Carburant moyen', style: AppText.heading3),
                              StatusBadge(
                                label: _avgFuel <= 20
                                    ? 'CRITIQUE'
                                    : _avgFuel <= 40
                                        ? 'BAS'
                                        : 'OK',
                                color: _avgFuel <= 20
                                    ? AppColors.danger
                                    : _avgFuel <= 40
                                        ? AppColors.warning
                                        : AppColors.success,
                              ),
                            ]),
                        const SizedBox(height: 14),
                        LinearPercentIndicator(
                          lineHeight: 10,
                          percent: (_avgFuel / 100).clamp(0, 1),
                          backgroundColor: AppColors.cardBorder,
                          linearGradient: _avgFuel > 40
                              ? AppColors.gradientTeal
                              : _avgFuel > 20
                                  ? const LinearGradient(colors: [
                                      Color(0xFFFF9500),
                                      Color(0xFFFFC107)
                                    ])
                                  : AppColors.gradientOrange,
                          barRadius: const Radius.circular(10),
                          padding: EdgeInsets.zero,
                        ),
                        const SizedBox(height: 8),
                        Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('0%', style: AppText.caption),
                              Text('${_avgFuel.toStringAsFixed(0)}%',
                                  style: GoogleFonts.inter(
                                      color: AppColors.textPrimary,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700)),
                              Text('100%', style: AppText.caption),
                            ]),
                      ]),
                ).animate().fadeIn(delay: 200.ms).slideY(begin: 0.2),

                const SizedBox(height: 20),

                // ── Recent Machines
                SectionHeader(title: 'Chariots récents', action: 'Voir tout'),
                const SizedBox(height: 12),

                ..._machines.take(3).toList().asMap().entries.map((e) {
                  final m = e.value;
                  final isOnline = m['status'] == 'online';
                  final t = m['telemetry'];
                  final temp = t?['temp'] != null
                      ? '${double.tryParse('${t['temp']}')?.toStringAsFixed(0) ?? '--'}°C'
                      : '--';
                  return _MiniMachineCard(
                          machine: m,
                          isOnline: isOnline,
                          temp: temp,
                          index: e.key)
                      .animate()
                      .fadeIn(delay: (e.key * 80 + 300).ms)
                      .slideX(begin: 0.15);
                }),

                if (_machines.isEmpty)
                  const EmptyState(
                      icon: Icons.local_shipping_outlined,
                      title: 'Aucun chariot trouvé'),

                const SizedBox(height: 20),

                // ── Recent Alerts
                if (_notifications.isNotEmpty) ...[
                  SectionHeader(title: 'Alertes récentes', action: 'Voir tout'),
                  const SizedBox(height: 12),
                  ..._notifications.take(3).toList().asMap().entries.map((e) {
                    final n = e.value;
                    return _MiniNotifCard(notif: n, index: e.key)
                        .animate()
                        .fadeIn(delay: (e.key * 60 + 400).ms)
                        .slideX(begin: -0.15);
                  }),
                ],
              ])),
            ),
        ]),
      ),
    );
  }
}

class _MiniMachineCard extends StatelessWidget {
  final dynamic machine;
  final bool isOnline;
  final String temp;
  final int index;
  const _MiniMachineCard(
      {required this.machine,
      required this.isOnline,
      required this.temp,
      required this.index});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => MachineDetailScreen(machine: machine))),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: isOnline
                  ? AppColors.success.withAlpha(60)
                  : AppColors.cardBorder),
        ),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: isOnline
                  ? AppColors.success.withAlpha(25)
                  : AppColors.textMuted.withAlpha(20),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.local_shipping_rounded,
                color: isOnline ? AppColors.success : AppColors.textMuted,
                size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(machine['name'] ?? '',
                    style: AppText.heading3.copyWith(fontSize: 14)),
                Text(machine['model'] ?? '',
                    style: AppText.bodySecondary.copyWith(fontSize: 12)),
              ])),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            StatusBadge(
                label: isOnline ? 'EN LIGNE' : 'HORS LIGNE',
                color: isOnline ? AppColors.success : AppColors.danger),
            const SizedBox(height: 4),
            Text(temp,
                style: GoogleFonts.inter(
                    color: AppColors.textSecondary, fontSize: 12)),
          ]),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 18),
        ]),
      ),
    );
  }
}

class _MiniNotifCard extends StatelessWidget {
  final dynamic notif;
  final int index;
  const _MiniNotifCard({required this.notif, required this.index});

  @override
  Widget build(BuildContext context) {
    final type = notif['type'] ?? '';
    final color = switch (type) {
      'danger' => AppColors.danger,
      'warning' => AppColors.warning,
      'info' => AppColors.info,
      _ => AppColors.primary,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border(
            left: BorderSide(color: color, width: 3),
            top: BorderSide(color: AppColors.cardBorder),
            right: BorderSide(color: AppColors.cardBorder),
            bottom: BorderSide(color: AppColors.cardBorder)),
      ),
      child: Row(children: [
        Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
                color: color.withAlpha(25),
                borderRadius: BorderRadius.circular(8)),
            child: Icon(Icons.notifications_outlined, color: color, size: 14)),
        const SizedBox(width: 10),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(notif['title'] ?? '',
              style: AppText.body
                  .copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
          Text(notif['message'] ?? '',
              style: AppText.caption,
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ])),
      ]),
    );
  }
}
