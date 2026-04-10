# Guide : Comment flasher l'ESP32-WROOM-32 (Module nu)

L'ESP32-WROOM-32 est un module "nu" qui ne possède pas de port USB direct ni de convertisseur USB-Série intégré. Pour envoyer le programme, vous devez utiliser un adaptateur **FTDI (USB to Serial)**.

## 1. Connexions nécessaires (ESP32-WROOM-32 Module nu)

> [!CAUTION]
> **ATTENTION :** Un câble USB standard coupé donne du **5V** (Fil Rouge). Si vous branchez le 5V sur la pin 3.3V de l'ESP32, vous allez griller la puce. Utilisez un convertisseur de tension ou une pile 3.3V.

Si vous utilisez un **câble adaptateur USB-Série** (type PL2303/CH340), les couleurs sont souvent :

| Couleur Fil | Fonction | Pin ESP32-WROOM-32 |
|-------------|----------|-------------------|
| **Rouge**   | **5V**   | **INTERDIT** (Va griller la puce sur 3.3V) |
| **Gris**    | **GND**  | **GND** (Haut Gauche) |
| **Vert**    | **TX**   | **RX0** (Bas Droite - 2) |
| **Blanc**   | **RX**   | **TX0** (Bas Droite - 3) |

### Branchement minimal pour le flash

1. **3V3** (Haut Droite) -> Source 3.3V Stable.
2. **EN** (Haut Droite - 3) -> Source 3.3V Stable (Obligatoire).
3. **GND** -> GND de la source et de l'adaptateur.
4. **IO0** (Bas Gauche) -> **GND** (Pour le mode Flash).
5. **RX0** -> Vert (TX de l'adaptateur).
6. **TX0** -> Blanc (RX de l'adaptateur).

## 2. Entrer en mode "FLASH" (Programmation)

Pour que l'ESP32 accepte le nouveau code, il doit démarrer avec **IO0 (GPIO 0)** à la masse (GND) :

1. Reliez **IO0** à la **GND**.
2. Faire un **Reset** (touche EN à GND brièvement puis relâcher).
3. L'ESP32 est maintenant en mode Flash.

## 4. Dépannage : "Failed to connect to ESP32"

Si vous voyez `Connecting........` suivi d'une erreur, l'ESP32 ne répond pas. Vérifiez ceci :

- **L'ESP32 est-il bien en mode Flash ?**
  - Le fil entre **IO0** et **GND** doit être présent **AVANT** de brancher l'USB ou de faire un Reset.
  - Si vous branchez l'USB puis connectez IO0, ça ne marchera pas. Il faut faire un Reset (EN à GND brièvement) après avoir connecté IO0.
- **Inversion RX/TX** : C'est l'erreur n°1. Essayez d'inverser les fils blanc/bleu (TX/RX) sur l'adaptateur.
- **Vitesse de flash** : J'ai réduit la vitesse à `115200` dans `platformio.ini` pour plus de stabilité.
- **Alimentation** : Si vous utilisez le 3.3V du module FTDI, il est souvent trop faible. Si possible, utilisez une alimentation 3.3V externe (mais reliez bien tous les **GND** ensemble).

> [!IMPORTANT]
> Sur un module nu, les broches **IO12** et **IO15** ne doivent pas être reliées à n'importe quoi au démarrage (laissez-les vides au début pour tester).
