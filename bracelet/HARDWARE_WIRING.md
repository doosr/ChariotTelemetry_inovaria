# Hardware Wiring Guide - Safety Bracelet (ESP32 DevKit/WROOM)

## Components

1. **ESP32 DevKit V1 / WROOM-32**
2. **OLED Display (1.3" or 0.96" SH1106/SSD1306 I2C)**
3. **GY-906 (MLX90614) Infrared Temperature Sensor**
4. **Vibration Motor** (via Transistor)
5. **Piezo Buzzer**
6. **LiPo Battery (3.7V)** + TP4056 Charger + 3.3V Regulator

## Pinout Mapping

| Component          | Pin on Module   | Pin on ESP32 (GPIO) | Notes                |
|:-------------------|:----------------|:--------------------|:---------------------|
| **OLED**           | VCC             | 3.3V                | Power (3.3V Only!)   |
| **OLED**           | GND             | GND                 | Ground               |
| **OLED**           | **SDA**         | **GPIO 21**         | I2C Data             |
| **OLED**           | **SCL**         | **GPIO 22**         | I2C Clock            |
| **GY-906**         | VIN             | 3.3V                | Power (3.3V Only!)   |
| **GY-906**         | GND             | GND                 | Ground               |
| **GY-906**         | **SDA**         | **GPIO 21**         | I2C Data (Shared)    |
| **GY-906**         | **SCL**         | **GPIO 22**         | I2C Clock (Shared)   |
| **Vibrateur**       | Fil Rouge (+)    | 3.3V / 5V             | Alerte Vibration   |
| **Vibrateur**       | Fil Bleu/Noir (-) | Collecteur (C)        | Vers Transistor    |
| **Transistor 2N2222**| **Emitter (E)**   | **GND**               | Masse (Broche 1)   | 
| **Transistor 2N2222**| **Base (B)**      | **GPIO 12**           | Commande (Broche 2)|
| **Transistor 2N2222**| **Collector (C)** | **Vibrateur (-)**     | Charge (Broche 3)  |
| **Buzzer**          | Positive (+)      | **GPIO 13**           | Alerte Sonore      |
| **Status LED**     | Positive (+)    | **GPIO 2**          | Built-in LED         |

## Guide de Câblage du Transistor (2N2222)

Pour le moteur de vibration, utilisez le transistor **2N2222** (boîtier TO-92 en plastique noir avec un côté plat).

**Orientation** : Tenez le transistor avec le **côté plat face à vous**, les broches vers le bas.
1.  **Broche 1 (Gauche) : ÉMETTEUR** -> Connectez au **GND**.
2.  **Broche 2 (Milieu) : BASE** -> Connectez au **GPIO 12** (via une résistance de 1kΩ ou 2.2kΩ).
3.  **Broche 3 (Droite) : COLLECTEUR** -> Connectez au fil **Négatif (-)** du vibreur.

> [!IMPORTANT]
> N'oubliez pas de mettre une **résistance (1kΩ)** entre le GPIO 12 et la Base du transistor pour protéger votre ESP32.
> Le fil **Positif (+)** du vibreur doit être relié directement au **3.3V** ou **5V**.

## Notes

- **I2C Shared Bus**: Both the OLED and the GY-906 use the same I2C pins (21 and 22).
- **Power**: All sensors and the display MUST be powered by **3.3V**. Connecting them to 5V may permanentely damage the GY-906 and OLED.
- **Vibrator Protection**: Use a flyback diode (e.g., 1N4007) across the vibration motor terminals to protect the transistor from voltage spikes.
- **Startup**: The bracelet will cycle through the Clock, Temperature, and Truck Scanning screens every 5 seconds.
