import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vibration/vibration.dart';
import 'package:audioplayers/audioplayers.dart';
import '../core/app_theme.dart';

class GlobalAlertOverlay extends StatefulWidget {
  final Map<String, dynamic> alertData;
  final VoidCallback onDismiss;

  const GlobalAlertOverlay({super.key, required this.alertData, required this.onDismiss});

  @override
  State<GlobalAlertOverlay> createState() => _GlobalAlertOverlayState();
}

class _GlobalAlertOverlayState extends State<GlobalAlertOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  final _audioPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))..repeat(reverse: true);
    _vibrate();
    _playAlertSound();
  }

  Future<void> _playAlertSound() async {
    try {
      // Using a standard notification sound URL or asset (if provided)
      await _audioPlayer.play(UrlSource('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));
      _audioPlayer.setReleaseMode(ReleaseMode.loop);
    } catch (e) {
      debugPrint("Could not play alert sound: $e");
    }
  }

  Future<void> _vibrate() async {
    if (await Vibration.hasVibrator() == true) {
      if (await Vibration.hasCustomVibrationsSupport() == true) {
        Vibration.vibrate(pattern: [500, 500, 500, 500]);
      } else {
        Vibration.vibrate();
      }
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.alertData['title'] ?? 'ALERTE';
    final message = widget.alertData['message'] ?? 'Erreur système inconnue';
    final isRadar = title.toLowerCase().contains('radar');
    final isOil = title.toLowerCase().contains('huile');
    final color = isRadar ? AppColors.success : AppColors.danger;

    return Material(
      color: Colors.black.withAlpha(200),
      child: SafeArea(
        child: Center(
          child: AnimatedBuilder(
            animation: _pulseCtrl,
            builder: (context, child) {
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 30),
                padding: const EdgeInsets.all(30),
                decoration: BoxDecoration(
                  color: color.withAlpha(30),
                  borderRadius: BorderRadius.circular(30),
                  border: Border.all(color: color, width: 3 + (_pulseCtrl.value * 3)),
                  boxShadow: [
                    BoxShadow(color: color.withAlpha(100), blurRadius: 40 * _pulseCtrl.value, spreadRadius: 10 * _pulseCtrl.value)
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(isRadar ? Icons.radar : isOil ? Icons.oil_barrel : Icons.warning_rounded, color: color, size: 80),
                    const SizedBox(height: 20),
                    Text(title.toUpperCase(), textAlign: TextAlign.center, style: GoogleFonts.inter(color: color, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 2)),
                    const SizedBox(height: 10),
                    Text(message, textAlign: TextAlign.center, style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 40),
                    GestureDetector(
                      onTap: widget.onDismiss,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(15)),
                        child: Text('FERMER', style: GoogleFonts.inter(color: Colors.black, fontSize: 18, fontWeight: FontWeight.w900)),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ).animate().fadeIn(duration: 200.ms).scale(begin: const Offset(0.8, 0.8)),
      ),
    );
  }
}

class GlobalAlertManager {
  static OverlayEntry? _overlayEntry;

  static void show(BuildContext context, Map<String, dynamic> alertData) {
    if (_overlayEntry != null) return; // Prevent multiple overlays
    
    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        top: 0, bottom: 0, left: 0, right: 0,
        child: GlobalAlertOverlay(
          alertData: alertData,
          onDismiss: () => hide(),
        ),
      ),
    );
    Overlay.of(context).insert(_overlayEntry!);
  }

  static void hide() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }
}
