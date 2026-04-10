import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _all = [];
  bool _loading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    timeago.setLocaleMessages('fr', timeago.FrMessages());
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final data = await _api.getNotifications(limit: 50);
    if (mounted)
      setState(() {
        _all = data;
        _loading = false;
      });
  }

  List<dynamic> get _filtered {
    if (_filter == 'all') return _all;
    if (_filter == 'unread')
      return _all.where((n) => n['read'] != true).toList();
    return _all.where((n) => (n['type'] ?? '') == _filter).toList();
  }

  int get _unreadCount => _all.where((n) => n['read'] != true).length;

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          SliverAppBar(
            expandedHeight: 150,
            pinned: true,
            backgroundColor: AppColors.bg,
            actions: [
              if (_all.isNotEmpty) ...[
                IconButton(
                    icon: const Icon(Icons.done_all, color: AppColors.accent),
                    onPressed: () async {
                      await _api.markAllNotificationsRead();
                      _fetch();
                    }),
                IconButton(
                    icon: const Icon(Icons.delete_sweep_outlined,
                        color: AppColors.danger),
                    onPressed: () async {
                      final ok = await showConfirm(context,
                          title: 'Effacer tout',
                          content: 'Supprimer toutes les notifications ?');
                      if (ok == true) {
                        await _api.clearNotifications();
                        _fetch();
                      }
                    }),
              ],
              const SizedBox(width: 4),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 44),
                        Row(children: [
                          Text('Alertes', style: AppText.heading1),
                          const SizedBox(width: 10),
                          if (_unreadCount > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                  gradient: AppColors.gradientOrange,
                                  borderRadius: BorderRadius.circular(20)),
                              child: Text('$_unreadCount',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700)),
                            ),
                        ]),
                        const SizedBox(height: 4),
                        Text(
                            '${_all.length} notification${_all.length != 1 ? 's' : ''}',
                            style: AppText.bodySecondary),
                      ]),
                ),
              ),
            ),
          ),

          // Filter chips
          SliverToBoxAdapter(
            child: SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _chip('Tout', 'all'),
                  _chip('Non lus', 'unread'),
                  _chip('Danger', 'danger', AppColors.danger),
                  _chip('Avertissement', 'warning', AppColors.warning),
                  _chip('Info', 'info', AppColors.info),
                ],
              ),
            ),
          ),

          if (_loading)
            const SliverFillRemaining(child: LoadingOverlay())
          else if (filtered.isEmpty)
            SliverFillRemaining(
              child: EmptyState(
                icon: Icons.notifications_off_outlined,
                title: _filter == 'unread'
                    ? 'Tout est lu !'
                    : 'Aucune notification',
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => _NotifCard(notif: filtered[i], index: i)
                      .animate()
                      .fadeIn(delay: (i * 40).ms)
                      .slideX(begin: 0.15),
                  childCount: filtered.length,
                ),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _chip(String label, String value, [Color? color]) {
    final active = _filter == value;
    final c = color ?? AppColors.primary;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(right: 8, top: 5, bottom: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: active ? c.withAlpha(40) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? c : AppColors.cardBorder),
        ),
        alignment: Alignment.center,
        child: Text(label,
            style: GoogleFonts.inter(
                color: active ? c : AppColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class _NotifCard extends StatefulWidget {
  final dynamic notif;
  final int index;
  const _NotifCard({required this.notif, required this.index});

  @override
  State<_NotifCard> createState() => _NotifCardState();
}

class _NotifCardState extends State<_NotifCard> {
  bool _stopping = false;

  Future<void> _stopAlarm(BuildContext context) async {
    setState(() => _stopping = true);
    final auth = context.read<AuthProvider>();
    final deviceId = widget.notif['deviceId'];
    if (deviceId != null) {
      // Fetch the machine to clear geofence via PUT as in web
      try {
        await ApiService().updateMachine(deviceId, {'geofence': null});
        await ApiService()
            .sendCommand(deviceId, auth.userId, 'TRIGGER_ALARM', 'off');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: const Text('L\'alarme a été coupée.'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ));
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: const Text('Impossible d\'arrêter l\'alarme'),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
          ));
        }
      }
    }
    if (mounted) setState(() => _stopping = false);
  }

  @override
  Widget build(BuildContext context) {
    final type = widget.notif['type'] ?? '';
    final isRead = widget.notif['read'] == true;
    final createdAt = widget.notif['createdAt'] != null
        ? DateTime.tryParse(widget.notif['createdAt'].toString())
        : null;

    final isAlarm =
        type == 'danger' || type == 'geofence' || type == 'overheat';

    final (color, icon) = switch (type) {
      'danger' => (AppColors.danger, Icons.warning_amber_rounded),
      'warning' => (AppColors.warning, Icons.error_outline),
      'info' => (AppColors.info, Icons.info_outline),
      'geofence' => (AppColors.orange, Icons.location_off_outlined),
      'overheat' => (AppColors.danger, Icons.thermostat_outlined),
      'fuel_low' => (AppColors.warning, Icons.local_gas_station_outlined),
      'maintenance' => (AppColors.accent, Icons.build_circle_outlined),
      _ => (AppColors.primary, Icons.notifications_outlined),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isRead ? AppColors.card : AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border(
          left: BorderSide(color: color, width: 3),
          top: const BorderSide(color: AppColors.cardBorder),
          right: const BorderSide(color: AppColors.cardBorder),
          bottom: const BorderSide(color: AppColors.cardBorder),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                    color: color.withAlpha(25),
                    borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(children: [
                      Expanded(
                          child: Text(widget.notif['title'] ?? 'Alerte',
                              style: AppText.body.copyWith(
                                  fontWeight: isRead
                                      ? FontWeight.w500
                                      : FontWeight.w700,
                                  fontSize: 14))),
                      if (!isRead)
                        Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle)),
                    ]),
                    const SizedBox(height: 4),
                    Text(widget.notif['message'] ?? '',
                        style: AppText.bodySecondary.copyWith(fontSize: 13),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                    if (createdAt != null) ...[
                      const SizedBox(height: 6),
                      Row(children: [
                        const Icon(Icons.access_time,
                            color: AppColors.textMuted, size: 11),
                        const SizedBox(width: 4),
                        Text(timeago.format(createdAt, locale: 'fr'),
                            style: AppText.caption),
                        if (widget.notif['deviceId'] != null) ...[
                          const SizedBox(width: 8),
                          Text('· ${widget.notif['deviceId']}',
                              style: AppText.caption,
                              overflow: TextOverflow.ellipsis),
                        ],
                      ]),
                    ],
                  ])),
            ]),
            if (isAlarm && widget.notif['deviceId'] != null) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  SizedBox(
                    height: 32,
                    child: ElevatedButton.icon(
                      onPressed: _stopping ? null : () => _stopAlarm(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.danger.withAlpha(20),
                        foregroundColor: AppColors.danger,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: _stopping
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.volume_off, size: 16),
                      label: const Text('Arrêter l\'alarme',
                          style: TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  )
                ],
              )
            ]
          ],
        ),
      ),
    );
  }
}
