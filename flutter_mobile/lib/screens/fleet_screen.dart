import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';
import 'machine_detail_screen.dart';
import 'add_machine_screen.dart';

class FleetScreen extends StatefulWidget {
  const FleetScreen({super.key});
  @override
  State<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends State<FleetScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _all = [];
  List<dynamic> _filtered = [];
  bool _loading = true;
  String _search = '';
  String _filter = 'all'; // all, online, offline, running

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();
    final data = await _api.getMachines(
      ownerId: auth.isSystemAdmin ? null : auth.userId,
      role: auth.userRole,
      technicianId: auth.isTechnician ? auth.userId : null,
    );
    if (mounted)
      setState(() {
        _all = data;
        _applyFilter();
        _loading = false;
      });
  }

  void _applyFilter() {
    var list = _all;
    if (_search.isNotEmpty) {
      list = list
          .where((m) =>
              (m['name'] ?? '')
                  .toString()
                  .toLowerCase()
                  .contains(_search.toLowerCase()) ||
              (m['model'] ?? '')
                  .toString()
                  .toLowerCase()
                  .contains(_search.toLowerCase()))
          .toList();
    }
    list = switch (_filter) {
      'online' => list.where((m) => m['status'] == 'online').toList(),
      'offline' => list.where((m) => m['status'] != 'online').toList(),
      'running' => list.where((m) => m['trip']?['isRunning'] == true).toList(),
      _ => list,
    };
    _filtered = list;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final online = _all.where((m) => m['status'] == 'online').length;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          SliverAppBar(
            expandedHeight: 160,
            pinned: true,
            backgroundColor: AppColors.bg,
            actions: [
              if (auth.isAdminOrAbove)
                IconButton(
                  icon: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                          gradient: AppColors.gradientPurpleBlue,
                          borderRadius: BorderRadius.circular(10)),
                      child:
                          const Icon(Icons.add, color: Colors.white, size: 18)),
                  onPressed: () async {
                    final result = await Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const AddMachineScreen()));
                    if (result == true) _fetch();
                  },
                ),
              const SizedBox(width: 8),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 44),
                        Text('Ma Flotte', style: AppText.heading1),
                        const SizedBox(height: 6),
                        Row(children: [
                          Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                  color: AppColors.success,
                                  shape: BoxShape.circle)),
                          const SizedBox(width: 6),
                          Text('$online en ligne · ${_all.length} total',
                              style: AppText.bodySecondary),
                        ]),
                      ]),
                ),
              ),
            ),
          ),

          // Search + Filters
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Column(children: [
                TextFormField(
                  onChanged: (v) {
                    setState(() {
                      _search = v;
                      _applyFilter();
                    });
                  },
                  style: const TextStyle(
                      color: AppColors.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Rechercher un chariot...',
                    hintStyle: const TextStyle(color: AppColors.textMuted),
                    prefixIcon: const Icon(Icons.search,
                        color: AppColors.textMuted, size: 18),
                    filled: true,
                    fillColor: AppColors.card,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.cardBorder)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.cardBorder)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(color: AppColors.primary)),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 34,
                  child: ListView(scrollDirection: Axis.horizontal, children: [
                    _FilterChip(
                        label: 'Tous',
                        value: 'all',
                        selected: _filter,
                        onTap: (v) {
                          setState(() {
                            _filter = v;
                            _applyFilter();
                          });
                        }),
                    _FilterChip(
                        label: 'En ligne',
                        value: 'online',
                        selected: _filter,
                        onTap: (v) {
                          setState(() {
                            _filter = v;
                            _applyFilter();
                          });
                        },
                        color: AppColors.success),
                    _FilterChip(
                        label: 'Hors ligne',
                        value: 'offline',
                        selected: _filter,
                        onTap: (v) {
                          setState(() {
                            _filter = v;
                            _applyFilter();
                          });
                        },
                        color: AppColors.danger),
                    _FilterChip(
                        label: 'En trajet',
                        value: 'running',
                        selected: _filter,
                        onTap: (v) {
                          setState(() {
                            _filter = v;
                            _applyFilter();
                          });
                        },
                        color: AppColors.primary),
                  ]),
                ),
              ]),
            ),
          ),

          // Machine list
          if (_loading)
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                  delegate: SliverChildBuilderDelegate((_, i) => _ShimmerCard(),
                      childCount: 4)),
            )
          else if (_filtered.isEmpty)
            SliverFillRemaining(
              child: EmptyState(
                icon: Icons.local_shipping_outlined,
                title: _search.isNotEmpty ? 'Aucun résultat' : 'Aucun chariot',
                subtitle: _search.isNotEmpty
                    ? 'Essayez un autre terme de recherche'
                    : null,
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => MachineCard(
                          machine: _filtered[i], index: i, onRefresh: _fetch)
                      .animate()
                      .fadeIn(delay: (i * 60).ms)
                      .slideY(begin: 0.15),
                  childCount: _filtered.length,
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final String value;
  final String selected;
  final void Function(String) onTap;
  final Color? color;
  const _FilterChip(
      {required this.label,
      required this.value,
      required this.selected,
      required this.onTap,
      this.color});

  @override
  Widget build(BuildContext context) {
    final active = selected == value;
    final c = color ?? AppColors.primary;
    return GestureDetector(
      onTap: () => onTap(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? c.withAlpha(40) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? c : AppColors.cardBorder),
        ),
        child: Text(label,
            style: GoogleFonts.inter(
                color: active ? c : AppColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// ── Machine Card ─────────────────────────────────────────────────────────────

class MachineCard extends StatelessWidget {
  final dynamic machine;
  final int index;
  final VoidCallback? onRefresh;

  const MachineCard(
      {super.key, required this.machine, required this.index, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final isOnline = machine['status'] == 'online';
    final t = machine['telemetry'];
    final tempRaw = t?['temp'];
    final temp = tempRaw != null
        ? double.tryParse('$tempRaw')?.toStringAsFixed(1)
        : null;
    final fuelRaw = t?['fuel_percent'] ?? machine['health']?['fuel'];
    final fuel =
        fuelRaw != null ? (double.tryParse('$fuelRaw')?.round() ?? 0) : null;
    final isRunning = machine['trip']?['isRunning'] == true;

    return GestureDetector(
      onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => MachineDetailScreen(machine: machine)))
          .then((_) => onRefresh?.call()),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: isOnline
                  ? AppColors.success.withAlpha(50)
                  : AppColors.cardBorder),
        ),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              // Header
              Row(children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isOnline
                        ? AppColors.success.withAlpha(25)
                        : AppColors.textMuted.withAlpha(15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                      isRunning
                          ? Icons.directions_run_rounded
                          : Icons.local_shipping_rounded,
                      color: isOnline ? AppColors.success : AppColors.textMuted,
                      size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(machine['name'] ?? '', style: AppText.heading3),
                      const SizedBox(height: 2),
                      Text(machine['model'] ?? '',
                          style: AppText.bodySecondary.copyWith(fontSize: 13)),
                    ])),
                StatusBadge(
                    label: isOnline ? 'EN LIGNE' : 'HORS LIGNE',
                    color: isOnline ? AppColors.success : AppColors.danger),
              ]),

              const SizedBox(height: 14),
              const Divider(color: AppColors.divider, height: 1),
              const SizedBox(height: 14),

              // Metrics
              Row(children: [
                _Metric(
                    label: 'Température',
                    value: temp != null ? '$temp°C' : '--',
                    color: _tempColor(double.tryParse(temp ?? '')),
                    icon: Icons.thermostat_outlined),
                const SizedBox(width: 16),
                Expanded(child: _FuelBar(fuel: fuel)),
              ]),

              if (isRunning) ...[
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.primary.withAlpha(50)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.directions_run,
                        color: AppColors.primary, size: 13),
                    const SizedBox(width: 5),
                    Text('Trajet en cours',
                        style: GoogleFonts.inter(
                            color: AppColors.primary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600)),
                  ]),
                ),
              ],
            ]),
          ),

          // Footer
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(20),
                  bottomRight: Radius.circular(20)),
            ),
            child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('ID: ${machine['deviceId'] ?? '—'}',
                      style: AppText.caption),
                  Row(children: [
                    Text('Voir détails',
                        style: GoogleFonts.inter(
                            color: AppColors.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(width: 4),
                    const Icon(Icons.arrow_forward_ios,
                        color: AppColors.primary, size: 11),
                  ]),
                ]),
          ),
        ]),
      ),
    );
  }

  Color _tempColor(double? t) {
    if (t == null) return AppColors.textSecondary;
    if (t >= 90) return AppColors.danger;
    if (t >= 75) return AppColors.warning;
    return AppColors.success;
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;
  const _Metric(
      {required this.label,
      required this.value,
      required this.color,
      required this.icon});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, color: AppColors.textMuted, size: 12),
          const SizedBox(width: 4),
          Text(label, style: AppText.label),
        ]),
        const SizedBox(height: 4),
        Text(value,
            style: GoogleFonts.inter(
                color: color, fontSize: 18, fontWeight: FontWeight.w800)),
      ]);
}

class _FuelBar extends StatelessWidget {
  final int? fuel;
  const _FuelBar({this.fuel});

  @override
  Widget build(BuildContext context) {
    final color = fuel == null
        ? AppColors.textMuted
        : fuel! <= 15
            ? AppColors.danger
            : fuel! <= 30
                ? AppColors.warning
                : AppColors.success;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Icon(Icons.local_gas_station_outlined,
            color: AppColors.textMuted, size: 12),
        const SizedBox(width: 4),
        Text('Carburant', style: AppText.label),
      ]),
      const SizedBox(height: 4),
      if (fuel != null) ...[
        LinearPercentIndicator(
          lineHeight: 7,
          percent: (fuel! / 100).clamp(0, 1).toDouble(),
          backgroundColor: AppColors.cardBorder,
          progressColor: color,
          barRadius: const Radius.circular(10),
          padding: EdgeInsets.zero,
        ),
        const SizedBox(height: 4),
        Text('$fuel%',
            style: GoogleFonts.inter(
                color: color, fontSize: 13, fontWeight: FontWeight.w700)),
      ] else
        Text('--', style: AppText.bodySecondary),
    ]);
  }
}

class _ShimmerCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Shimmer.fromColors(
        baseColor: AppColors.card,
        highlightColor: AppColors.cardBorder,
        child: Container(
          height: 170,
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
              color: AppColors.card, borderRadius: BorderRadius.circular(20)),
        ),
      );
}
