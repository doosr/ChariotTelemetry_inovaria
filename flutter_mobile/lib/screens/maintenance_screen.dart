import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// MAINTENANCE SCREEN — full parity with web + premium mobile features
// ═══════════════════════════════════════════════════════════════════════════════

class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});
  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen>
    with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  List<dynamic> _machines = [];
  bool _loading = true;
  String _filter = 'all'; // all | ok | due | overdue
  String _sort = 'name'; // name | hours_asc | hours_desc | pct_desc | status
  late AnimationController _pulseCtrl;

  @override
  void initState() {
    super.initState();
    _pulseCtrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 2))
          ..repeat(reverse: true);
    _fetch();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();
    final data = await _api.getMachines(
      includeTelemetry: true,
      ownerId: auth.isSystemAdmin ? null : auth.userId,
      role: auth.userRole,
      technicianId: auth.isTechnician ? auth.userId : null,
    );
    if (mounted) {
      setState(() {
        _machines = data;
        _loading = false;
      });
    }
  }

  // ── Logic helpers identical to web ─────────────────────────────────────────

  _MaintStatus _status(dynamic m) {
    final maint = m['maintenance'] ?? {};
    final h = (maint['engineHours'] ?? 0) as num;
    final km = (m['odometer'] ?? 0) as num;
    final nextH = (maint['nextOilChangeHours'] ?? 500) as num;
    final nextKm = (maint['nextOilChangeKm'] ?? 10000) as num;
    final lastH = (maint['lastOilChangeHours'] ?? 0) as num;
    final lastKm = (maint['lastOilChangeKm'] ?? 0) as num;

    final pctH = nextH - lastH > 0
        ? ((h - lastH) / (nextH - lastH) * 100).clamp(0, 100).toDouble()
        : 0.0;
    final pctKm = nextKm - lastKm > 0
        ? ((km - lastKm) / (nextKm - lastKm) * 100).clamp(0, 100).toDouble()
        : 0.0;
    final maxPct = pctH > pctKm ? pctH : pctKm;
    final isOverdue = h >= nextH || km >= nextKm;
    final isDue = !isOverdue && maxPct >= 85;

    return _MaintStatus(
      pctH: pctH,
      pctKm: pctKm,
      maxPct: maxPct,
      isOverdue: isOverdue,
      isDue: isDue,
      h: h.toDouble(),
      km: km.toDouble(),
      nextH: nextH.toDouble(),
      nextKm: nextKm.toDouble(),
    );
  }

  List<dynamic> get _filtered {
    var list = _machines.where((m) {
      final s = _status(m);
      if (_filter == 'ok') return !s.isOverdue && !s.isDue;
      if (_filter == 'due') return s.isDue;
      if (_filter == 'overdue') return s.isOverdue;
      return true;
    }).toList();

    list.sort((a, b) {
      final sa = _status(a), sb = _status(b);
      switch (_sort) {
        case 'hours_asc':
          return sa.h.compareTo(sb.h);
        case 'hours_desc':
          return sb.h.compareTo(sa.h);
        case 'pct_desc':
          return sb.maxPct.compareTo(sa.maxPct);
        case 'status':
          int rank(_MaintStatus s) => s.isOverdue
              ? 0
              : s.isDue
                  ? 1
                  : 2;
          return rank(sa).compareTo(rank(sb));
        default:
          return (a['name'] ?? '')
              .toString()
              .compareTo((b['name'] ?? '').toString());
      }
    });
    return list;
  }

  // KPI counters
  int get _kpiTotal => _machines.length;
  int get _kpiOk => _machines.where((m) {
        final s = _status(m);
        return !s.isOverdue && !s.isDue;
      }).length;
  int get _kpiDue => _machines.where((m) => _status(m).isDue).length;
  int get _kpiOverdue => _machines.where((m) => _status(m).isOverdue).length;
  double get _totalHours =>
      _machines.fold(0.0, (acc, m) => acc + (_status(m).h));

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          // ── SliverAppBar
          _buildAppBar(),

          if (_loading)
            const SliverFillRemaining(child: LoadingOverlay())
          else ...[
            // ── KPI Row
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverToBoxAdapter(
                  child: _KpiRow(
                total: _kpiTotal,
                ok: _kpiOk,
                due: _kpiDue,
                overdue: _kpiOverdue,
                totalHours: _totalHours,
              ).animate().fadeIn(delay: 100.ms).slideY(begin: 0.15)),
            ),

            // ── Alert banner (overdue > 0)
            if (_kpiOverdue > 0)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: _AlertBanner(
                          count: _kpiOverdue,
                          pulse: _pulseCtrl,
                          onTap: () => setState(() => _filter = 'overdue'))
                      .animate()
                      .fadeIn(delay: 200.ms)
                      .scale(),
                ),
              ),

            // ── Filter + Sort toolbar
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              sliver: SliverToBoxAdapter(
                child: _FilterBar(
                  filter: _filter,
                  sort: _sort,
                  onFilter: (f) => setState(() => _filter = f),
                  onSort: (s) => setState(() => _sort = s),
                ).animate().fadeIn(delay: 250.ms),
              ),
            ),

            // ── Machine cards
            if (_filtered.isEmpty)
              const SliverFillRemaining(
                child: EmptyState(
                    icon: Icons.check_circle_outline,
                    title: 'Aucun chariot dans cette catégorie'),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) => _MachineCard(
                      machine: _filtered[i],
                      status: _status(_filtered[i]),
                      onValidate: () => _openValidateModal(_filtered[i]),
                      onViewSheet: () => _openTechSheet(_filtered[i]),
                    )
                        .animate()
                        .fadeIn(delay: (i * 55 + 300).ms)
                        .slideY(begin: 0.15),
                    childCount: _filtered.length,
                  ),
                ),
              ),
          ],
        ]),
      ),
    );
  }

  Widget _buildAppBar() {
    return SliverAppBar(
      expandedHeight: 140,
      pinned: true,
      backgroundColor: AppColors.bg,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_new, size: 18),
        onPressed: () => Navigator.pop(context),
      ),
      actions: [
        IconButton(
          icon:
              const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
          tooltip: 'Actualiser',
          onPressed: _fetch,
        ),
        const SizedBox(width: 8),
      ],
      flexibleSpace: FlexibleSpaceBar(
        background: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SizedBox(height: 44),
              ShaderMask(
                shaderCallback: (b) =>
                    AppColors.gradientPurpleBlue.createShader(b),
                child: Text('🔧 Maintenance Préventive',
                    style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900)),
              ),
              const SizedBox(height: 4),
              Text('Gestion des révisions et suivi technique',
                  style: AppText.bodySecondary.copyWith(fontSize: 12)),
              const SizedBox(height: 8),
              // Live dot
              Row(children: [
                AnimatedBuilder(
                    animation: _pulseCtrl,
                    builder: (_, __) => Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: AppColors.success.withAlpha(
                                (120 + (_pulseCtrl.value * 135)).toInt()),
                            shape: BoxShape.circle,
                          ),
                        )),
                const SizedBox(width: 6),
                Text('Rafraîchissement automatique actif',
                    style: AppText.caption),
              ]),
            ]),
          ),
        ),
      ),
    );
  }

  // ── Validate oil change modal ───────────────────────────────────────────────

  void _openValidateModal(dynamic machine) {
    final maint = machine['maintenance'] ?? {};
    final s = _status(machine);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ValidateModal(
        machine: machine,
        status: s,
        maint: maint,
        onSaved: () async {
          Navigator.pop(context);
          await _fetch();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Row(children: [
                const Icon(Icons.check_circle_outline, color: Colors.white),
                const SizedBox(width: 10),
                Text('Vidange enregistrée avec succès !',
                    style: GoogleFonts.inter(
                        color: Colors.white, fontWeight: FontWeight.w600)),
              ]),
              backgroundColor: AppColors.success,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ));
          }
        },
      ),
    );
  }

  // ── Tech Sheet modal ────────────────────────────────────────────────────────

  void _openTechSheet(dynamic machine) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          _TechSheetModal(machine: machine, status: _status(machine)),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI ROW
// ═══════════════════════════════════════════════════════════════════════════════

class _KpiRow extends StatelessWidget {
  final int total, ok, due, overdue;
  final double totalHours;
  const _KpiRow(
      {required this.total,
      required this.ok,
      required this.due,
      required this.overdue,
      required this.totalHours});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 105,
      child: ListView(scrollDirection: Axis.horizontal, children: [
        _KpiCard(
            label: 'Total',
            value: '$total',
            icon: '🚜',
            color: AppColors.primary),
        _KpiCard(
            label: 'Optimal',
            value: '$ok',
            icon: '✅',
            color: AppColors.success),
        _KpiCard(
            label: 'Bientôt dû',
            value: '$due',
            icon: '⚠️',
            color: AppColors.warning),
        _KpiCard(
            label: 'En retard',
            value: '$overdue',
            icon: '🚨',
            color: AppColors.danger),
        _KpiCard(
            label: 'Heures Total',
            value: '${totalHours.toStringAsFixed(0)}h',
            icon: '⏱️',
            color: AppColors.accent),
      ]),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label, value, icon;
  final Color color;
  const _KpiCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) => Container(
        width: 130,
        height: 100,
        margin: const EdgeInsets.only(right: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withAlpha(50)),
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(children: [
                Text(icon, style: const TextStyle(fontSize: 16)),
                const Spacer(),
                Container(
                    width: 6,
                    height: 6,
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle)),
              ]),
              Text(value,
                  style: GoogleFonts.inter(
                      color: color, fontSize: 22, fontWeight: FontWeight.w900)),
              Text(label.toUpperCase(),
                  style: GoogleFonts.inter(
                      color: AppColors.textMuted,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8)),
            ]),
      );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT BANNER
// ═══════════════════════════════════════════════════════════════════════════════

class _AlertBanner extends StatelessWidget {
  final int count;
  final AnimationController pulse;
  final VoidCallback onTap;
  const _AlertBanner(
      {required this.count, required this.pulse, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (_, child) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.danger.withAlpha(15),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: AppColors.danger
                  .withAlpha((50 + (pulse.value * 100)).toInt())),
        ),
        child: child,
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Row(children: [
          const Text('🚨', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$count chariot(s) en retard de maintenance',
                  style: GoogleFonts.inter(
                      color: AppColors.danger,
                      fontSize: 14,
                      fontWeight: FontWeight.w700)),
              Text('Intervention requise immédiatement',
                  style: AppText.bodySecondary.copyWith(fontSize: 12)),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
                color: AppColors.danger,
                borderRadius: BorderRadius.circular(20)),
            child: Text('$count',
                style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: AppColors.danger, size: 16),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER + SORT BAR
// ═══════════════════════════════════════════════════════════════════════════════

class _FilterBar extends StatelessWidget {
  final String filter, sort;
  final void Function(String) onFilter;
  final void Function(String) onSort;
  const _FilterBar(
      {required this.filter,
      required this.sort,
      required this.onFilter,
      required this.onSort});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      // Filter chips
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          _FilterChip('Tout', 'all', Icons.apps_rounded, filter, onFilter),
          _FilterChip(
              'Optimal', 'ok', Icons.check_circle_rounded, filter, onFilter,
              color: AppColors.success),
          _FilterChip('Bientôt', 'due', Icons.warning_rounded, filter, onFilter,
              color: AppColors.warning),
          _FilterChip(
              'En retard', 'overdue', Icons.error_rounded, filter, onFilter,
              color: AppColors.danger),
        ]),
      ),
      const SizedBox(height: 8),
      // Sort dropdown
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
        decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.cardBorder)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: sort,
            isExpanded: true,
            dropdownColor: AppColors.card,
            icon: const Icon(Icons.sort_rounded,
                color: AppColors.textMuted, size: 18),
            style:
                GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 13),
            onChanged: (v) => v != null ? onSort(v) : null,
            items: const [
              DropdownMenuItem(value: 'name', child: Text('Trier par Nom')),
              DropdownMenuItem(
                  value: 'hours_asc', child: Text('↑ Heures moteur')),
              DropdownMenuItem(
                  value: 'hours_desc', child: Text('↓ Heures moteur')),
              DropdownMenuItem(
                  value: 'pct_desc', child: Text('↓ % Maintenance')),
              DropdownMenuItem(
                  value: 'status', child: Text('Priorité urgence')),
            ],
          ),
        ),
      ),
    ]);
  }
}

class _FilterChip extends StatelessWidget {
  final String label, value, current;
  final IconData icon;
  final void Function(String) onTap;
  final Color? color;
  const _FilterChip(this.label, this.value, this.icon, this.current, this.onTap,
      {this.color});

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    final c = color ?? AppColors.primary;
    return GestureDetector(
      onTap: () => onTap(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? c.withAlpha(25) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: active ? c.withAlpha(100) : AppColors.cardBorder),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: active ? c : AppColors.textMuted, size: 14),
          const SizedBox(width: 6),
          Text(label,
              style: GoogleFonts.inter(
                  color: active ? c : AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: active ? FontWeight.w700 : FontWeight.normal)),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MACHINE CARD (mirrors web card)
// ═══════════════════════════════════════════════════════════════════════════════

class _MachineCard extends StatelessWidget {
  final dynamic machine;
  final _MaintStatus status;
  final VoidCallback onValidate;
  final VoidCallback onViewSheet;
  const _MachineCard(
      {required this.machine,
      required this.status,
      required this.onValidate,
      required this.onViewSheet});

  Color get _statusColor => status.isOverdue
      ? AppColors.danger
      : status.isDue
          ? AppColors.warning
          : AppColors.success;
  String get _statusLabel => status.isOverdue
      ? '🚨 En retard'
      : status.isDue
          ? '⚠️ Bientôt dû'
          : '✅ Optimal';
  Color get _barColor => status.isOverdue
      ? AppColors.danger
      : status.isDue
          ? AppColors.warning
          : AppColors.primary;

  Color _tempColor(num? t) {
    if (t == null) return AppColors.textSecondary;
    if (t > 100) return AppColors.danger;
    if (t > 85) return AppColors.warning;
    return AppColors.success;
  }

  Color _fuelColor(num? f) {
    if (f == null) return AppColors.textSecondary;
    if (f < 15) return AppColors.danger;
    if (f < 30) return AppColors.warning;
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    final maint = machine['maintenance'] ?? {};
    final health = machine['health'] ?? {};
    final temp = health['temp'] as num?;
    final oil = health['oil'] as num?;
    final fuel = health['fuel'] as num?;
    final nextH = (maint['nextOilChangeHours'] ?? 500) as num;
    final nextKm = (maint['nextOilChangeKm'] ?? 10000) as num;
    final model = machine['model'] ?? '';
    final serial =
        machine['serial'] != null ? '· S/N: ${machine["serial"]}' : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: _statusColor
                .withAlpha(status.isOverdue || status.isDue ? 80 : 40)),
      ),
      child: Column(children: [
        // Gradient top bar (3px)
        Container(
          height: 3,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              _barColor,
              status.isOverdue
                  ? AppColors.danger.withAlpha(180)
                  : status.isDue
                      ? AppColors.warning.withAlpha(180)
                      : AppColors.accent,
            ]),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
        ),

        Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── Header
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(machine['name'] ?? '', style: AppText.heading3),
                    if (model.isNotEmpty || serial.isNotEmpty)
                      Text('$model $serial',
                          style: AppText.caption,
                          overflow: TextOverflow.ellipsis),
                    Text(machine['deviceId'] ?? '',
                        style: AppText.caption
                            .copyWith(fontFamily: 'monospace', fontSize: 10)),
                  ])),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _statusColor.withAlpha(20),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _statusColor.withAlpha(80)),
                ),
                child: Text(_statusLabel,
                    style: GoogleFonts.inter(
                        color: _statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w800)),
              ),
            ]),

            const SizedBox(height: 14),
            const Divider(color: AppColors.divider, height: 1),
            const SizedBox(height: 14),

            // ── 2-col progress stats
            Row(children: [
              Expanded(
                  child: _ProgressStat(
                label: '⏱ Heures Moteur',
                value: '${status.h.toStringAsFixed(1)} h',
                next: '${nextH.toStringAsFixed(0)} h',
                pct: status.pctH / 100,
                color: _barColor,
              )),
              const SizedBox(width: 10),
              Expanded(
                  child: _ProgressStat(
                label: '🛣 Kilométrage',
                value: '${status.km.toStringAsFixed(0)} km',
                next: '${nextKm.toStringAsFixed(0)} km',
                pct: status.pctKm / 100,
                color: _barColor,
              )),
            ]),

            const SizedBox(height: 14),

            // ── Sensor chips row (temp, oil, fuel) — same as web
            Row(children: [
              Expanded(
                  child: _SensorChip(
                      label: '🌡 Moteur',
                      value:
                          temp != null ? '${temp.toStringAsFixed(0)} °C' : '—',
                      color: _tempColor(temp))),
              const SizedBox(width: 8),
              Expanded(
                  child: _SensorChip(
                      label: '🛢 Huile',
                      value: oil != null ? '$oil Bar' : '—',
                      color: AppColors.textSecondary)),
              const SizedBox(width: 8),
              Expanded(
                  child: _SensorChip(
                      label: '⛽ Carburant',
                      value: fuel != null ? '$fuel%' : '—',
                      color: _fuelColor(fuel))),
            ]),

            const SizedBox(height: 14),

            // ── Last maintenance indicator
            Row(children: [
              const Icon(Icons.history_rounded,
                  color: AppColors.textMuted, size: 13),
              const SizedBox(width: 6),
              Text('Dernière vidange : ', style: AppText.caption),
              Text(
                _lastMaintenanceLabel(maint),
                style: GoogleFonts.inter(
                    color: AppColors.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700),
              ),
            ]),

            const SizedBox(height: 14),

            // ── Action buttons (mirrors web card-actions)
            Row(children: [
              Expanded(
                flex: 3,
                child: GradientButton(
                  label: '🔧 Valider Vidange',
                  onPressed: onValidate,
                  height: 42,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.description_outlined, size: 14),
                  label: const Text('Fiche'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textSecondary,
                    side: const BorderSide(color: AppColors.cardBorder),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    minimumSize: const Size(0, 42),
                    textStyle: GoogleFonts.inter(
                        fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  onPressed: onViewSheet,
                ),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }

  String _lastMaintenanceLabel(dynamic maint) {
    final lastH = maint['lastOilChangeHours'];
    final lastKm = maint['lastOilChangeKm'];
    if (lastH == null || (lastH as num) == 0) return 'Jamais effectuée';
    return '${lastH.toStringAsFixed(0)}h · ${lastKm ?? 0} km';
  }
}

class _ProgressStat extends StatelessWidget {
  final String label, value, next;
  final double pct;
  final Color color;
  const _ProgressStat(
      {required this.label,
      required this.value,
      required this.next,
      required this.pct,
      required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.cardBorder)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppText.label),
          const SizedBox(height: 4),
          Text(value,
              style: GoogleFonts.inter(
                  color: color,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  fontFeatures: [const FontFeature.tabularFigures()])),
          const SizedBox(height: 8),
          ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: pct.clamp(0.0, 1.0),
                minHeight: 5,
                backgroundColor: AppColors.cardBorder,
                valueColor: AlwaysStoppedAnimation(color),
              )),
          const SizedBox(height: 4),
          Text('Prochain: $next · ${(pct * 100).toStringAsFixed(0)}%',
              style: AppText.caption),
        ]),
      );
}

class _SensorChip extends StatelessWidget {
  final String label, value;
  final Color color;
  const _SensorChip(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.cardBorder)),
        child: Column(children: [
          Text(value,
              style: GoogleFonts.inter(
                  color: color, fontSize: 14, fontWeight: FontWeight.w800)),
          const SizedBox(height: 3),
          Text(label, style: AppText.caption, textAlign: TextAlign.center),
        ]),
      );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE MODAL (= web modal vidange)
// ═══════════════════════════════════════════════════════════════════════════════

class _ValidateModal extends StatefulWidget {
  final dynamic machine, maint;
  final _MaintStatus status;
  final VoidCallback onSaved;
  const _ValidateModal(
      {required this.machine,
      required this.maint,
      required this.status,
      required this.onSaved});

  @override
  State<_ValidateModal> createState() => _ValidateModalState();
}

class _ValidateModalState extends State<_ValidateModal> {
  final ApiService _api = ApiService();
  final _hoursCtrl = TextEditingController();
  final _kmCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _intervalH = '500';
  String _intervalKm = '10000';
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _hoursCtrl.text = widget.status.h.toStringAsFixed(1);
    _kmCtrl.text = widget.status.km.toStringAsFixed(0);
  }

  @override
  void dispose() {
    _hoursCtrl.dispose();
    _kmCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final h = double.tryParse(_hoursCtrl.text) ?? 0;
    final km = double.tryParse(_kmCtrl.text) ?? 0;
    final iH = double.tryParse(_intervalH) ?? 500;
    final iKm = double.tryParse(_intervalKm) ?? 10000;

    setState(() {
      _loading = true;
      _error = null;
    });

    final result = await _api.updateMachine(widget.machine['deviceId'], {
      'maintenance': {
        'lastOilChangeHours': h,
        'nextOilChangeHours': h + iH,
        'lastOilChangeKm': km,
        'nextOilChangeKm': km + iKm,
        'engineHours': h,
      },
      'odometer': km,
    });

    if (!mounted) return;
    if ((result['statusCode'] as int? ?? 0) < 300) {
      widget.onSaved();
    } else {
      setState(() {
        _error = 'Erreur lors de la sauvegarde';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * 0.90;
    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      decoration: const BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Handle
        Center(
            child: Container(
                margin: const EdgeInsets.only(top: 12),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.cardBorder,
                    borderRadius: BorderRadius.circular(4)))),

        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(children: [
            ShaderMask(
              shaderCallback: (b) =>
                  AppColors.gradientPurpleBlue.createShader(b),
              child: Text(
                  '🔧 Valider Vidange — ${widget.machine['name'] ?? ''}',
                  style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
            ),
            const Spacer(),
            IconButton(
                icon:
                    const Icon(Icons.close_rounded, color: AppColors.textMuted),
                onPressed: () => Navigator.pop(context)),
          ]),
        ),

        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(children: [
              if (_error != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: AppColors.danger.withAlpha(20),
                      borderRadius: BorderRadius.circular(10)),
                  child: Text(_error!,
                      style: const TextStyle(
                          color: AppColors.danger, fontSize: 13)),
                ),

              // Hours + KM row
              Row(children: [
                Expanded(
                    child: _ModalField(
                        label: 'Heures Moteur (h)',
                        controller: _hoursCtrl,
                        hint: 'Ex: 342.5',
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true))),
                const SizedBox(width: 12),
                Expanded(
                    child: _ModalField(
                        label: 'Kilométrage (km)',
                        controller: _kmCtrl,
                        hint: 'Ex: 12500',
                        keyboardType: TextInputType.number)),
              ]),
              const SizedBox(height: 12),

              // Interval dropdowns (mirrors web)
              Row(children: [
                Expanded(
                    child: _ModalDropdown(
                  label: 'Intervalle Révision (h)',
                  value: _intervalH,
                  items: const {
                    '250': '250h (intensif)',
                    '500': '500h (standard)',
                    '750': '750h (léger)',
                    '1000': '1000h (neuf)'
                  },
                  onChanged: (v) => setState(() => _intervalH = v!),
                )),
                const SizedBox(width: 12),
                Expanded(
                    child: _ModalDropdown(
                  label: 'Intervalle Révision (km)',
                  value: _intervalKm,
                  items: const {
                    '5000': '5 000 km',
                    '10000': '10 000 km',
                    '15000': '15 000 km',
                    '20000': '20 000 km'
                  },
                  onChanged: (v) => setState(() => _intervalKm = v!),
                )),
              ]),
              const SizedBox(height: 12),

              AppTextField(
                hint: 'Notes de maintenance (ex: Vidange + filtre air...)',
                controller: _notesCtrl,
                prefix: const Icon(Icons.notes_rounded,
                    color: AppColors.textMuted, size: 18),
                maxLines: 2,
              ),
              const SizedBox(height: 20),

              // Previous last change info chip
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppColors.bgCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.cardBorder)),
                child: Row(children: [
                  const Icon(Icons.info_outline_rounded,
                      color: AppColors.accent, size: 16),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text(
                    'Dernier: ${widget.maint['lastOilChangeHours'] ?? 0}h · ${widget.maint['lastOilChangeKm'] ?? 0}km  '
                    'Prochain: ${widget.maint['nextOilChangeHours'] ?? 500}h · ${widget.maint['nextOilChangeKm'] ?? 10000}km',
                    style: AppText.caption,
                  )),
                ]),
              ),

              const SizedBox(height: 20),
              GradientButton(
                  label: '✅ Enregistrer la Vidange',
                  loading: _loading,
                  onPressed: _save),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _ModalField extends StatelessWidget {
  final String label, hint;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final int? maxLines;
  const _ModalField(
      {required this.label,
      required this.controller,
      required this.hint,
      this.keyboardType,
      this.maxLines});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppText.label.copyWith(fontSize: 11)),
        const SizedBox(height: 6),
        AppTextField(
            hint: hint,
            controller: controller,
            keyboardType: keyboardType,
            maxLines: maxLines ?? 1),
      ]);
}

class _ModalDropdown extends StatelessWidget {
  final String label, value;
  final Map<String, String> items;
  final void Function(String?) onChanged;
  const _ModalDropdown(
      {required this.label,
      required this.value,
      required this.items,
      required this.onChanged});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppText.label.copyWith(fontSize: 11)),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.cardBorder)),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              dropdownColor: AppColors.card,
              icon: const Icon(Icons.expand_more_rounded,
                  color: AppColors.textMuted, size: 18),
              style:
                  GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 13),
              onChanged: onChanged,
              items: items.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
            ),
          ),
        ),
      ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECH SHEET MODAL (= web fiche technique)
// ═══════════════════════════════════════════════════════════════════════════════

class _TechSheetModal extends StatefulWidget {
  final dynamic machine;
  final _MaintStatus status;
  const _TechSheetModal({required this.machine, required this.status});

  @override
  State<_TechSheetModal> createState() => _TechSheetModalState();
}

class _TechSheetModalState extends State<_TechSheetModal> {
  List<dynamic> _assignedTechs = [];
  bool _loadingTechs = true;

  @override
  void initState() {
    super.initState();
    _loadTechnicians();
  }

  Future<void> _loadTechnicians() async {
    final api = ApiService();
    final auth = context.read<AuthProvider>();
    final all = await api.getUsers(
      parentAdminId: auth.userId,
      requesterRole: auth.userRole,
    );
    final assigned = all.where((u) => 
      u['role'] == 'Technicien' && 
      (u['assignedMachines'] as List?)?.contains(widget.machine['deviceId']) == true
    ).toList();
    
    if (mounted) {
      setState(() {
        _assignedTechs = assigned;
        _loadingTechs = false;
      });
    }
  }

  Future<void> _manageTechnicians() async {
    final api = ApiService();
    final auth = context.read<AuthProvider>();
    final allTechs = await api.getTechnicians(
      parentAdminId: auth.userId,
      requesterRole: auth.userRole,
    );

    if (!mounted) return;

    final selectedIds = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ManageTechsDialog(
        allTechs: allTechs,
        initialSelectedIds: _assignedTechs.map((t) => t['_id'].toString()).toList(),
      ),
    );

    if (selectedIds != null && mounted) {
      setState(() => _loadingTechs = true);
      await api.assignTechnicians(widget.machine['deviceId'], selectedIds);
      await _loadTechnicians();
    }
  }

  @override
  Widget build(BuildContext context) {
    final machine = widget.machine;
    final status = widget.status;
    final maint = machine['maintenance'] ?? {};
    final health = machine['health'] ?? {};
    final maxH = MediaQuery.of(context).size.height * 0.88;

    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: const BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Center(
            child: Container(
                margin: const EdgeInsets.only(top: 12),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.cardBorder,
                    borderRadius: BorderRadius.circular(4)))),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(children: [
            ShaderMask(
              shaderCallback: (b) => AppColors.gradientTeal.createShader(b),
              child: Text('📋 Fiche Technique',
                  style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w800)),
            ),
            const Spacer(),
            IconButton(
                icon:
                    const Icon(Icons.close_rounded, color: AppColors.textMuted),
                onPressed: () => Navigator.pop(context)),
          ]),
        ),
        const Divider(color: AppColors.divider, height: 1),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Section IDENTIFICATION
              _TechSection(title: '🚜 IDENTIFICATION', rows: [
                _TechRow('Nom', machine['name'] ?? '—'),
                _TechRow('Modèle', machine['model'] ?? '—'),
                _TechRow('N° Série', machine['serial'] ?? '—'),
                _TechRow('Device ID', machine['deviceId'] ?? '—',
                    monospace: true),
                _TechRow(
                    'Statut',
                    machine['status'] == 'online'
                        ? '🟢 En ligne'
                        : '🔴 Hors ligne',
                    color: machine['status'] == 'online'
                        ? AppColors.success
                        : AppColors.danger),
                if (machine['addedDate'] != null)
                  _TechRow('Ajouté le', _formatDate(machine['addedDate'])),
              ]),
              const SizedBox(height: 16),

              // Section ÉTAT ACTUEL
              _TechSection(title: '📊 ÉTAT ACTUEL', rows: [
                _TechRow('Heures moteur', '${status.h.toStringAsFixed(1)} h'),
                _TechRow('Kilométrage', '${status.km.toStringAsFixed(0)} km'),
                _TechRow('Température', '${health['temp'] ?? '—'} °C',
                    color: _tempColor(health['temp'] as num?)),
                _TechRow('Pression huile', '${health['oil'] ?? '—'} Bar'),
                _TechRow('Carburant', '${health['fuel'] ?? '—'} %',
                    color: _fuelColor(health['fuel'] as num?)),
                _TechRow('Avancement h', '${status.pctH.toStringAsFixed(0)}%',
                    color: status.isOverdue
                        ? AppColors.danger
                        : status.isDue
                            ? AppColors.warning
                            : AppColors.success),
              ]),
              const SizedBox(height: 16),

              // Section PLAN DE MAINTENANCE
              _TechSection(title: '🔧 PLAN DE MAINTENANCE', rows: [
                _TechRow('Dernière vidange (h)',
                    '${maint['lastOilChangeHours'] ?? 0} h'),
                _TechRow('Prochaine vidange (h)',
                    '${maint['nextOilChangeHours'] ?? 500} h'),
                _TechRow('Dernière vidange (km)',
                    '${maint['lastOilChangeKm'] ?? 0} km'),
                _TechRow('Prochaine vidange (km)',
                    '${maint['nextOilChangeKm'] ?? 10000} km'),
              ]),
              const SizedBox(height: 16),

              // Section TECHNICIENS
              _TechSection(
                title: '👷 TECHNICIENS ASSIGNÉS',
                rows: [
                  if (_loadingTechs)
                    const _TechRow('Chargement...', '...')
                  else if (_assignedTechs.isEmpty)
                    const _TechRow('Assignation', 'Aucun technicien')
                  else
                    ..._assignedTechs.map((t) => _TechRow(
                        'Technicien', t['name'] ?? t['email'] ?? '—')),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: _manageTechnicians,
                  icon: const Icon(Icons.add_link_rounded, size: 18),
                  label: const Text('Gérer les techniciens'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700),
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Copy device ID button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.copy_outlined, size: 15),
                  label: Text('Copier l\'ID technique',
                      style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.accent,
                    side: const BorderSide(color: AppColors.cardBorder),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    minimumSize: const Size(0, 44),
                  ),
                  onPressed: () {
                    Clipboard.setData(
                        ClipboardData(text: machine['deviceId'] ?? ''));
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: const Text('ID copié !'),
                          backgroundColor: AppColors.success,
                          behavior: SnackBarBehavior.floating,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10))),
                    );
                  },
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Color _tempColor(num? t) {
    if (t == null) return AppColors.textSecondary;
    if (t > 100) return AppColors.danger;
    if (t > 85) return AppColors.warning;
    return AppColors.success;
  }

  Color _fuelColor(num? f) {
    if (f == null) return AppColors.textSecondary;
    if (f < 15) return AppColors.danger;
    if (f < 30) return AppColors.warning;
    return AppColors.success;
  }

  String _formatDate(dynamic d) {
    try {
      return DateFormat('dd/MM/yyyy').format(DateTime.parse(d.toString()));
    } catch (_) {
      return d.toString();
    }
  }
}

class _TechSection extends StatelessWidget {
  final String title;
  final List<_TechRow> rows;
  const _TechSection({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            Text(title,
                style: GoogleFonts.inter(
                    color: AppColors.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2)),
            const SizedBox(width: 10),
            Expanded(child: Divider(color: AppColors.cardBorder)),
          ]),
        ),
        Container(
          decoration: BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.cardBorder)),
          child: Column(
              children: rows
                  .map((r) => _TechRowWidget(row: r, last: r == rows.last))
                  .toList()),
        ),
      ]);
}

class _TechRow {
  final String key, value;
  final Color? color;
  final bool monospace;
  const _TechRow(this.key, this.value, {this.color, this.monospace = false});
}

class _TechRowWidget extends StatelessWidget {
  final _TechRow row;
  final bool last;
  const _TechRowWidget({required this.row, required this.last});

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(children: [
            Text(row.key, style: AppText.bodySecondary.copyWith(fontSize: 13)),
            const Spacer(),
            Text(row.value,
                style: row.monospace
                    ? GoogleFonts.robotoMono(
                        color: row.color ?? AppColors.textPrimary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      )
                    : GoogleFonts.inter(
                        color: row.color ?? AppColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      )),
          ]),
        ),
        if (!last) const Divider(color: AppColors.divider, height: 1),
      ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA MODEL
// ═══════════════════════════════════════════════════════════════════════════════

class _MaintStatus {
  final double pctH, pctKm, maxPct, h, km, nextH, nextKm;
  final bool isOverdue, isDue;
  const _MaintStatus({
    required this.pctH,
    required this.pctKm,
    required this.maxPct,
    required this.isOverdue,
    required this.isDue,
    required this.h,
    required this.km,
    required this.nextH,
    required this.nextKm,
  });
}

class _ManageTechsDialog extends StatefulWidget {
  final List<dynamic> allTechs;
  final List<String> initialSelectedIds;
  const _ManageTechsDialog(
      {required this.allTechs, required this.initialSelectedIds});

  @override
  State<_ManageTechsDialog> createState() => _ManageTechsDialogState();
}

class _ManageTechsDialogState extends State<_ManageTechsDialog> {
  late List<String> _selectedIds;

  @override
  void initState() {
    super.initState();
    _selectedIds = List.from(widget.initialSelectedIds);
  }

  @override
  Widget build(BuildContext context) {
    // Premium bottom sheet for technician selection
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 20),
      decoration: const BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 40,
          height: 4,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
              color: AppColors.cardBorder,
              borderRadius: BorderRadius.circular(2)),
        ),
        ShaderMask(
          shaderCallback: (b) => AppColors.gradientPurpleBlue.createShader(b),
          child: Text('⚙️ Gérer les techniciens',
              style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 10),
        Text('Autoriser l\'accès à ce chariot',
            style: AppText.bodySecondary.copyWith(fontSize: 12)),
        const SizedBox(height: 20),
        ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.5),
          child: widget.allTechs.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(40),
                  child: Text('Aucun technicien créé', style: AppText.caption),
                )
              : ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: widget.allTechs.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (ctx, i) {
                    final t = widget.allTechs[i];
                    final tid = t['_id'].toString();
                    final isSelected = _selectedIds.contains(tid);
                    return _SelectionTile(
                      title: t['name'] ?? t['email'] ?? '—',
                      subtitle: t['email'] ?? '',
                      selected: isSelected,
                      onTap: () {
                        setState(() {
                          if (isSelected) {
                            _selectedIds.remove(tid);
                          } else {
                            _selectedIds.add(tid);
                          }
                        });
                      },
                    );
                  },
                ),
        ),
        const SizedBox(height: 25),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Expanded(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text('Annuler',
                    style: GoogleFonts.inter(color: AppColors.textMuted)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: GradientButton(
                label: 'Confirmer',
                onPressed: () => Navigator.pop(context, _selectedIds),
              ),
            ),
          ]),
        ),
      ]),
    ).animate().slideY(begin: 1.0, curve: Curves.easeOutQuart);
  }
}

class _SelectionTile extends StatelessWidget {
  final String title, subtitle;
  final bool selected;
  final VoidCallback onTap;
  const _SelectionTile(
      {required this.title,
      required this.subtitle,
      required this.selected,
      required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary.withAlpha(20) : AppColors.bgCard,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(
                color: selected
                    ? AppColors.primary.withAlpha(100)
                    : AppColors.cardBorder,
                width: selected ? 1.5 : 1),
          ),
          child: Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: GoogleFonts.inter(
                          color:
                              selected ? AppColors.primary : AppColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700)),
                  Text(subtitle, style: AppText.caption),
                ])),
            if (selected)
              const Icon(Icons.check_circle_rounded,
                  color: AppColors.primary, size: 22)
            else
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.textMuted.withAlpha(50))),
              ),
          ]),
        ),
      );
}
