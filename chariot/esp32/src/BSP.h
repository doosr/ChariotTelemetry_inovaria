#ifndef BSP_H
#define BSP_H
/**
 * @file BSP.h
 * @brief Board Support Package - Hardware Configuration
 *
 * This file centralizes all GPIO pin definitions and hardware configurations.
 * To change any pin assignment, simply modify the values here.
 */
// ========== ESP32 CORE CONFIGURATION ==========

#define SERIAL_BAUD_RATE 115200
#define BACKEND_HOST " 192.168.1.46"
#define BACKEND_PORT 3000
#define BACKEND_BASE_URL "http://192.168.1.46:3000"
// Device ID is auto-generated at startup: truck_XX (from chip MAC)
// Buffer of 32 chars supports IDs up to 31 characters long
// (truck_A3F2 = 10 chars) Buffer of 32 chars supports IDs up to 31 characters
// long (truck_A3F2 = 10 chars)
extern char DEVICE_ID[32];
// ========== SENSOR PINS ==========
// NTC Temperature Sensor (Now on ADS1115 for better accuracy!)
// OLD: GPIO 34 (ADC1_CH6) - 12-bit ESP32 ADC
// NEW: ADS1115 Channel 3 - 16-bit external ADC
// #define NTC_TEMPERATURE_PIN     34      // OLD - Now available as spare GPIO
// ========== I2C BUS CONFIGURATION ==========
#define I2C_SDA_PIN 21       // Default I2C SDA
#define I2C_SCL_PIN 22       // Default I2C SCL
#define I2C_FREQUENCY 100000 // 100 kHz
// ADS1115 I2C Address
#define ADS1115_I2C_ADDRESS 0x48 // Default address (ADDR -> GND)
// ========== ADS1115 CHANNEL MAPPING ==========
#define ADS1115_CH_OIL_PRESSURE 0    // Channel 0: Oil Pressure Sensor
#define ADS1115_CH_FUEL_LEVEL 1      // Channel 1: Fuel Level Sensor
#define ADS1115_CH_SPARE_1 2         // Channel 2: Available
#define ADS1115_CH_NTC_TEMPERATURE 3 // Channel 3: NTC Temperature Sensor (NEW!)
// ========== SIM808 MODULE CONFIGURATION ==========
#define SIM808_PWR_KEY_PIN 4  // Power key pin
#define SIM808_UART_RX 16     // ESP32 RX <- SIM808 TX
#define SIM808_UART_TX 17     // ESP32 TX -> SIM808 RX
#define SIM808_UART_NUM 2     // Hardware UART2
#define SIM808_BAUD_RATE 9600 // SIM808 baud rate
// Optional SIM808 pins (comment out if not used)
// #define SIM808_RESET_PIN     5
// #define SIM808_STATUS_PIN    18
// ========== RPM SENSOR CONFIGURATION ==========
#define RPM_SENSOR_PIN 35    // GPIO 35 (Input only, REQUIRES EXTERNAL PULLUP)
#define RPM_PULSES_PER_REV 1 // Number of magnets/pulses per revolution
#define RPM_TIMEOUT_MS 1000  // If no pulse for 1s, RPM = 0
// ========== TRANSMISSION SENSORS (Mano AV/AR) ==========
// Switch Type (Ref 12003-42451): Close to Ground when engaged
#define PIN_TRANSMISSION_FWD 32 // Forward Switch
#define PIN_TRANSMISSION_REV 33 // Reverse Switch
// ========== SPARE GPIO PINS ==========
// Reserve some pins for future expansion
// ========== ALARM SYSTEM ==========
#define GEOFENCE_ALARM_PIN 26 // Buzzer or Siren (SPARE_GPIO_1)
#define SPARE_GPIO_2 27
// Note: GPIO 25 (LED) used. 26/27 are ADC2 (Avoid if WiFi on, but WiFi is off).
// However, User reported conflict on 26/27, so we use 32/33 for critical gear
// sensors.
// ========== JSN-SR04T ULTRASONIC SENSOR (REAR PROXIMITY) ==========
// Waterproof ultrasonic sensor mounted at the rear of the forklift.
// Detects obstacles: pallets, walls, people (range: 20cm - 450cm).
// WIRING:
//   GPIO 14 (TRIG)  → JSN-SR04T TRIG
//   GPIO 13 (ECHO)  ← JSN-SR04T ECHO  [via voltage divider 2kΩ+1kΩ for 5V→3.3V]
//   5V              → JSN-SR04T VCC    (5V recommended for better range)
//   GND             → JSN-SR04T GND
#define PROXIMITY_TRIG_PIN 14         // GPIO 14 → TRIGGER pulse
#define PROXIMITY_ECHO_PIN 13         // GPIO 13 ← ECHO measure
#define PROXIMITY_MAX_RANGE_CM 400.0f // Max reliable range JSN-SR04T (cm)
#define PROXIMITY_MIN_RANGE_CM 20.0f  // Min reliable range (cm) - blind zone
#define PROXIMITY_ALERT_CM 80.0f // Alert threshold: obstacle < 80cm → DANGER
#define PROXIMITY_WARNING_CM                                                   \
  150.0f // Warning threshold: obstacle < 150cm → CAUTION
#define PROXIMITY_READ_INTERVAL_MS 200  // Proximity read cycle (200ms = 5Hz)
#define PROXIMITY_ECHO_TIMEOUT_US 25000 // Timeout µs (~430cm max, safe margin)
#define PROXIMITY_FILTER_SAMPLES 3  // Median filter samples for noise reduction
#define DEBUG_PROXIMITY_SENSOR true // Enable proximity debug serial output
// ========== SENSOR CALIBRATION CONSTANTS ==========
// NTC Temperature Sensor
// Circuit: 3.3V → NTC → (A3 channel + 1kΩ) → GND
#define NTC_VCC 3.3f          // Supply voltage
#define NTC_R_FIXED 1000.0f   // Fixed resistor (1kΩ)
#define NTC_BETA 3950.0f      // Beta coefficient
#define NTC_R0 3024.7f        // Resistance at 25°C
#define NTC_T0_KELVIN 298.15f // 25°C in Kelvin
// Oil Pressure Sensor (Resistive - Isuzu C240 or T30 Switch)
// Circuit: 3.3V -> 1kΩ Resistor -> ADS1115 Channel 0 -> Sensor -> GND
#define OIL_R_PULLUP 1000.0f // 1kΩ Pullup
#define OIL_V_REF 3.3f       // 3.3V Supply
// CONFIGURATION: Set to true if using a T30 Switch (On/Off), false for Analog
// Sensor
#define OIL_SENSOR_IS_SWITCH true
// LED Indicator
#define OIL_PRESSURE_OK_LED_PIN 25 // LED lights up when Pressure is OK
// Calibration for Switch (T30 / C240 Manocontact) -- ACTIVE
// Switch Closed (Ground) = Low Pressure (< 0.5 Bar)
// Switch Open (High Z)   = Pressure OK (> 0.5 Bar)
#define OIL_SWITCH_THRESHOLD_R                                                 \
  500.0f // Ohms (Below this = Closed/Low, Above = Open/OK)
#define OIL_SWITCH_PRESSURE_OK 4.0f // Simulated pressure when OK (Bar)
/* --- UNUSED ANALOG CALIBRATION (C240 Standard: 240-33 Ohms) ---
#define OIL_R_AT_0_BAR          240.0f  // Resistance at 0 Bar
#define OIL_R_AT_8_BAR          33.0f   // Resistance at 7-8 Bar
#define OIL_PRESSURE_P_MIN      0.0f    // Bar
#define OIL_PRESSURE_P_MAX      7.0f    // Bar
-------------------------------------------------------------- */
// Fuel Level Sensor (Resistive)
#define FUEL_R_EMPTY 12.0f       // Resistance when empty (Ω)
#define FUEL_R_FULL 166.0f       // Resistance when full (Ω)
#define FUEL_TANK_CAPACITY 52.0f // Tank capacity (Liters)
#define FUEL_V_REF 3.3f          // Reference voltage
#define FUEL_R_PULLUP 1000.0f    // Pullup resistor (Ω)
// ========== NETWORK CONFIGURATION ==========
#define APN_NAME "internet.ooredoo.tn"
#define GPRS_USER "" // Leave empty if not required
#define GPRS_PASS "" // Leave empty if not required

// ========== WIFI AP CONFIGURATION ==========
#define WIFI_AP_SSID "TRUCK_TELEMETRY"
#define WIFI_AP_PASS "12345678"
#define WEB_SERVER_PORT 80
// ========== MQTT BROKER CONFIGURATION ==========
// #define MQTT_BROKER             "broker.hivemq.com"
#define MQTT_BROKER "mqtt-dashboard.com" // Retour au Broker Public
#define MQTT_PORT 1883
#define MQTT_USER "" // No user
#define MQTT_PASS "" // No pass needed
// #define MQTT_TOPIC_TELEMETRY    "stagiaires/dawser/data"
// #define MQTT_TOPIC_ALERTS       "stagiaires/dawser/alerts"
// #define MQTT_TOPIC_COMMANDS     "stagiaires/dawser/status"
#define MQTT_TOPIC_TELEMETRY "feeds/truck-telemetry"
#define MQTT_TOPIC_ALERTS "feeds/truck-alerts"
#define MQTT_TOPIC_COMMANDS "feeds/truck-commands"
// ========== TIMING CONFIGURATION ==========
// #define SENSOR_READ_INTERVAL_MS         1000    // 1 second
// define TELEMETRY_ENGINE_ON_MS          10000   // 10 seconds
// #define TELEMETRY_ENGINE_OFF_MS         60000   // 60 seconds
// New Strategy: Fast Gear, Slow Analog
#define GEAR_READ_INTERVAL_MS 150     // 150ms (Check gears often)
#define SENSOR_READ_INTERVAL_MS 2000  // 2s (Read Fuel/Oil/Temp less often)
#define TELEMETRY_ENGINE_ON_MS 5000   // 5 seconds Heartbeat (Faster)
#define TELEMETRY_ENGINE_OFF_MS 60000 // 1 minute Heartbeat
#define NVS_SAVE_INTERVAL_MS 300000   // 5 minutes
#define GPS_MOVEMENT_THRESHOLD_M 2.0f // 2 meters (Very responsive)
#define GPS_MIN_SPEED_THRESHOLD 0.8f  // 0.8 km/h (Allow slow movement detection)
#define GPS_SPEED_SMOOTHING_ALPHA 0.3f // Smoothing factor (0.0 to 1.0)
#define GPS_MIN_SATS_RELIABLE 6       // Need 6+ sats for reliable speed


// ========== TELEMETRY RELIABILITY ==========
#define TELEMETRY_MAX_RETRIES 3        // Reduced retries
#define TELEMETRY_RETRY_DELAY_MS 5000  // Longer delay between retries
#define TELEMETRY_QUEUE_MAX_SIZE 10    // Max failed messages to queue
#define TELEMETRY_MIN_INTERVAL_MS 1000 // 1s Min Interval (Don't spam backend)
#define PROXIMITY_BROADCAST_MS 500     // 500ms (Fast broadcast for bracelets)
#define ESP_NOW_CHANNEL 1              // WiFi Channel for ESP-NOW
#define THRESHOLD_FUEL_LITERS 0.5f     // Send if fuel changes by > 0.5L
#define THRESHOLD_TEMP_CELSIUS 2.0f    // Send if temp changes by > 2.0C
// ========== BUSINESS LOGIC THRESHOLDS ===========
#define ENGINE_MIN_OIL_PRESSURE_BAR                                            \
  1.5f                     // Minimum oil pressure to count engine hours
#define ENGINE_MIN_RPM 100 // Minimum RPM to count engine hours
#define ALERT_HIGH_TEMP_CELSIUS 95.0f // High temperature alert threshold
#define FUEL_THEFT_MIN_DROP_LITERS                                             \
  5.0f // Minimum fuel drop to trigger theft alert
#define FUEL_THEFT_MAX_SPEED_KMH                                               \
  0.5f // Maximum speed to consider vehicle stationary
// ========== FREERTOS CONFIGURATION ==========
#define TASK_ACQUISITION_STACK_SIZE 4096
#define TASK_LOGIC_STACK_SIZE 10240     // Increased for GPRS/Alert safety
#define TASK_TELEMETRY_STACK_SIZE 10240 // Increased for large JSON safety
#define TASK_ACQUISITION_PRIORITY 2
#define TASK_LOGIC_PRIORITY 2
#define TASK_TELEMETRY_PRIORITY 1
#define TASK_ACQUISITION_CORE 0 // Run on Core 0
#define TASK_LOGIC_CORE 0       // Run on Core 0
#define TASK_TELEMETRY_CORE 1   // Run on Core 1
#define QUEUE_SENSOR_DATA_SIZE 5
#define QUEUE_TELEMETRY_DATA_SIZE 5
// Set to false in production to disable debug output
#define DEBUG_ENABLE_SERIAL true   // Master debug switch
#define DEBUG_SENSOR_READINGS true // DISABLED to reduce spam
#define DEBUG_FUEL_SENSOR                                                      \
  false // Show fuel sensor voltage, resistance, calculation
#define DEBUG_TEMP_SENSOR                                                      \
  false // Show temperature sensor voltage, resistance, calculation
#define DEBUG_TELEMETRY false   // Show telemetry send status and retries
#define DEBUG_GPS_DATA false    // Show GPS coordinates and fix status
#define DEBUG_CALIBRATION false // Show calibration process details
#define DEBUG_OIL_SENSOR                                                       \
  false // Show oil sensor voltage, resistance, calculation
#define DEBUG_NVS_STORAGE true    // Show NVS read/write operations
#define DEBUG_GSM_CONNECTION true // Show GSM/MQTT connection status
#endif                            // BSP_H