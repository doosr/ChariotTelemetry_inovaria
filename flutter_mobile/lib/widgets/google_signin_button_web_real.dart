import 'package:flutter/material.dart';
import 'package:google_sign_in_web/google_sign_in_web.dart' as web;
import 'package:google_sign_in_platform_interface/google_sign_in_platform_interface.dart';

class GoogleSignInButtonWeb extends StatelessWidget {
  const GoogleSignInButtonWeb({super.key});

  @override
  Widget build(BuildContext context) {
    // Access the platform implementation directly for web
    final plugin = GoogleSignInPlatform.instance as web.GoogleSignInPlugin;
    return plugin.renderButton();
  }
}
