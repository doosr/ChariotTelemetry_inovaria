/**
 * main.cpp - Advanced Smartphone-Style Firmware (ESP32-CAM-S)
 * Hardware: ESP32-CAM + 1.3" OLED (SH1106) + Vibration Motor
 * Flow: Logo -> Brand -> WiFi -> Phone UI -> Scanning -> Alert
 */

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Adafruit_MLX90614.h>
#include <HTTPClient.h>

// Fix for I2C_BUFFER_LENGTH redefinition warning
#ifdef I2C_BUFFER_LENGTH
#undef I2C_BUFFER_LENGTH
#endif
#include "MAX30105.h"
#include "heartRate.h"

// --- WIFI & SERVER CONFIG (PLACEHOLDERS) ---
const char* ssid = "Red";
const char* password = "123456789";
const char* serverUrl = "http://192.168.0.39:5000/api/personnel/bracelets"; // Route will be appended with deviceId

MAX30105 particleSensor;

// --- OLED CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- PIN CONFIGURATION ---
#define ALARM_VIBRATOR_PIN      12  
#define ALARM_BUZZER_PIN        13  
#define LED_INDICATOR_PIN       2   
#define I2C_SDA                 21
#define I2C_SCL                 22

Adafruit_MLX90614 mlx = Adafruit_MLX90614();

// --- GLOBAL STATE ---
int hour = 0;
int minute = 39;
const char* dayName = "Lundi";
const char* dateStr = "06 Avril 2026";
unsigned long lastClockUpdate = 0;

#define ALARM_DURATION_MS 5000
unsigned long lastAlarmTime = 0;
bool isAlarmActive = false;

// --- HEART RATE & SpO2 STATE ---
long lastBeat = 0; 
float bpm = 0;
#define RATE_SIZE 4
int rates[RATE_SIZE]; 
byte rateSpot = 0;
int beatAvg = 0;

int spo2 = 98; 
#define SPO2_SIZE 4
int spo2Values[SPO2_SIZE];
byte spo2Spot = 0;
int spo2Avg = 98;

unsigned long lastTelemetryTime = 0;
#define TELEMETRY_INTERVAL 10000 

// --- TEMPERATURE ALARM ---
bool isTempAlarmActive = false;
unsigned long lastTempAlarmTime = 0;
#define TEMP_THRESHOLD 38.0

typedef struct struct_message {
    char truckID[32];
    float speed;
    int status;
} struct_message;

typedef struct {
    char truckID[32];
    float speed;
    unsigned long lastSeen;
    bool active;
} TrackedTruck;

TrackedTruck nearbyTrucks[5]; // Track up to 5 trucks
struct_message incomingReadings;
char braceletID[12];
int truckCount = 0;

// --- BITMAPS ---
const unsigned char PROGMEM logo_bmp[] = {
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x03, 0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xF8, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x3F, 0xFF, 0xFE, 0x00, 0x00, 0x00, 0x07, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x1F, 0xFF, 0xFF, 0xE0, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xF8, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x07, 0xFF, 0xFF, 0xFF, 0xF8, 0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xFF, 0xF8, 0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0x00,
  0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xF8, 0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x00,
  0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xF0, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xF0, 0x00, 0x00,
  0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xF0, 0x00, 0x7F, 0xFF, 0x80, 0x0F, 0xFF, 0xF0, 0x00, 0x00,
  0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0xFF, 0xFE, 0x00, 0x01, 0xFF, 0xF8, 0x00, 0x00,
  0x00, 0x03, 0xFF, 0xFF, 0x00, 0x1F, 0xC0, 0x00, 0xFF, 0xFC, 0xFF, 0x00, 0xFF, 0xFC, 0x00, 0x00,
  0x00, 0x07, 0xFF, 0xFC, 0x00, 0x07, 0xC0, 0x01, 0xFF, 0xF1, 0xF8, 0x00, 0x7F, 0xFC, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xF8, 0x00, 0x01, 0x80, 0x01, 0xFF, 0xE7, 0xC0, 0x00, 0x3F, 0xFE, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xF0, 0x00, 0x00, 0x00, 0x03, 0xFF, 0xCF, 0x00, 0x00, 0x1F, 0xFE, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x03, 0xFF, 0x9E, 0x00, 0x00, 0x0F, 0xFF, 0x00, 0x00,
  0x00, 0x1F, 0xFF, 0xC0, 0x00, 0x00, 0x00, 0x07, 0xFF, 0xBC, 0x00, 0x00, 0x07, 0xFF, 0x00, 0x00,
  0x00, 0x1F, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x07, 0xFF, 0x38, 0x00, 0x00, 0x07, 0xFF, 0x00, 0x00,
  0x00, 0x1F, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0x70, 0x00, 0x00, 0x03, 0xFF, 0x00, 0x00,
  0x00, 0x1F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0x70, 0x00, 0x00, 0x03, 0xFF, 0x80, 0x00,
  0x00, 0x1F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x1F, 0xFE, 0xE0, 0x00, 0x00, 0x03, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x1F, 0xFE, 0xE0, 0x00, 0x00, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x3F, 0xFE, 0xE0, 0x03, 0x80, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFE, 0x00, 0x00, 0x00, 0x00, 0x3F, 0xFE, 0xE0, 0x07, 0xC0, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFE, 0x00, 0x00, 0x00, 0x00, 0x7F, 0xFE, 0xE0, 0x07, 0xC0, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFE, 0x00, 0x00, 0x00, 0x00, 0x7F, 0xFE, 0xE0, 0x07, 0xC0, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFE, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFC, 0x60, 0x03, 0x80, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFE, 0x60, 0x00, 0x00, 0x01, 0xFF, 0x80, 0x00,
  0x00, 0x3F, 0xFF, 0x00, 0x00, 0x00, 0x01, 0xFF, 0xFE, 0x20, 0x00, 0x00, 0x03, 0xFF, 0x80, 0x00,
  0x00, 0x1F, 0xFF, 0x00, 0x00, 0x00, 0x03, 0xFF, 0xFE, 0x20, 0x00, 0x00, 0x0B, 0xFF, 0x80, 0x00,
  0x00, 0x1F, 0xFF, 0x00, 0x00, 0x00, 0x07, 0xFF, 0xFE, 0x10, 0x00, 0x00, 0x1B, 0xFF, 0x80, 0x00,
  0x00, 0x1F, 0xFF, 0x80, 0x00, 0x00, 0x07, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x1F, 0xFF, 0x80, 0x00,
  0x00, 0x1F, 0xFF, 0x80, 0x00, 0x00, 0x0F, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x3F, 0xFF, 0x00, 0x00,
  0x00, 0x1F, 0xFF, 0xC0, 0x00, 0x00, 0x1F, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x3F, 0xFF, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xE0, 0x00, 0x00, 0x1F, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x6F, 0xFF, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xE0, 0x00, 0x00, 0x3F, 0xFF, 0xFF, 0xC0, 0x00, 0x00, 0xDF, 0xFF, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xF0, 0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x03, 0xBF, 0xFE, 0x00, 0x00,
  0x00, 0x07, 0xFF, 0xFC, 0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xF0, 0x00, 0x07, 0x7F, 0xFE, 0x00, 0x00,
  0x00, 0x07, 0xFF, 0xFF, 0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xF8, 0x01, 0xFE, 0xFF, 0xFC, 0x00, 0x00,
  0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE, 0xFF, 0xFE, 0x01, 0xFB, 0xFF, 0xFC, 0x00, 0x00,
  0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xF8, 0x7F, 0xFF, 0x80, 0xFF, 0xFF, 0xF8, 0x00, 0x00,
  0x00, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xF8, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xF0, 0x00, 0x00,
  0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xF0, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x00,
  0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xE0, 0x1F, 0xFF, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x00,
  0x00, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0x80, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0x00,
  0x00, 0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFE, 0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFE, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xF8, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xE0, 0x00, 0x00, 0x7F, 0xFF, 0xFF, 0xF0, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x3F, 0xFF, 0xFF, 0x80, 0x00, 0x00, 0x1F, 0xFF, 0xFF, 0xC0, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x07, 0xFF, 0xF8, 0x00, 0x00, 0x00, 0x03, 0xFF, 0xFE, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// =============================================
// UI: Helpers
// =============================================
void drawStatusBar() {
    display.fillRect(2, 6, 2, 2, SH110X_WHITE);
    display.fillRect(5, 4, 2, 4, SH110X_WHITE);
    display.fillRect(8, 2, 2, 6, SH110X_WHITE);
    display.fillRect(11, 0, 2, 8, SH110X_WHITE);
    display.setTextSize(1);
    display.setCursor(16, 1);
    display.print("4G");
    display.drawRect(110, 1, 14, 7, SH110X_WHITE);
    display.fillRect(111, 2, 10, 5, SH110X_WHITE);
    display.fillRect(124, 3, 2, 3, SH110X_WHITE);
}

// =============================================
// SCREEN: Home (Smartphone)
// =============================================
void drawHomeScreen() {
    display.clearDisplay();
    display.setTextColor(SH110X_WHITE);
    drawStatusBar();
    
    char timeStr[6];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d", hour, minute);
    display.setTextSize(4);
    display.setCursor(5, 15);
    display.print(timeStr);
    
    display.setTextSize(1);
    display.setCursor(15, 52);
    display.print(dayName);
    display.print(" ");
    display.print(dateStr);
    display.display();
}

// =============================================
// SCREEN: Scanning (Animated Radar)
// =============================================
void drawScanningScreen() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(35, 5);
    display.print("RECHERCHE...");
    
    // Draw Radar Circle
    display.drawCircle(64, 38, 24, SH110X_WHITE);
    display.drawCircle(64, 38, 12, SH110X_WHITE);
    display.drawPixel(64, 38, SH110X_WHITE);
    
    // Animated Radar Sweep
    float angle = (millis() / 200.0);
    int lineX = 64 + cos(angle) * 23;
    int lineY = 38 + sin(angle) * 23;
    display.drawLine(64, 38, lineX, lineY, SH110X_WHITE);
    
    display.setCursor(20, 56);
    display.print("Scan ID: ");
    display.print(braceletID);
    display.display();
}

// =============================================
// SCREEN: Alert (High Visibility)
// =============================================
void drawAlertScreen() {
    display.clearDisplay();
    // Invert background for alert
    display.fillRect(0, 0, 128, 64, SH110X_WHITE);
    display.setTextColor(SH110X_BLACK);
    
    display.setTextSize(1);
    display.setCursor(35, 2);
    display.print("!! ALERTE !!");
    
    display.setTextSize(2);
    display.setCursor(5, 15);
    display.print("TRUCK:");
    display.setCursor(5, 32);
    display.print(incomingReadings.truckID);
    
    display.setTextSize(1);
    display.setCursor(5, 52);
    display.print("VITESSE: ");
    display.setTextSize(2);
    display.print(incomingReadings.speed, 1);
    display.setTextSize(1);
    display.print(" km/h");
    
    // Multi-truck count overlay
    if (truckCount > 1) {
        display.fillRect(80, 0, 48, 12, SH110X_BLACK);
        display.setCursor(82, 2);
        display.print("+");
        display.print(truckCount - 1);
        display.print(" AUTRES");
    }

    display.display();
}

// =============================================
// SCREEN: Temperature (Real-time)
// =============================================
// =============================================
// SCREEN: Temperature (Real-time)
// =============================================
void drawTemperatureScreen() {
    display.clearDisplay();
    display.setTextColor(SH110X_WHITE);
    drawStatusBar();

    float objTemp = mlx.readObjectTempC();
    float ambTemp = mlx.readAmbientTempC();

    display.setTextSize(1);
    display.setCursor(5, 12);
    display.print("TEMPERATURE:");

    // Object Temperature (Body/Object)
    display.setTextSize(2);
    display.setCursor(5, 25);
    display.print(objTemp, 1);
    display.print(" C");
    display.setTextSize(1);
    display.setCursor(85, 25);
    display.print("(OBJ)");

    // Ambient Temperature
    display.setTextSize(1);
    display.setCursor(5, 48);
    display.print("Ambiante: ");
    display.print(ambTemp, 1);
    display.print(" C");

    // Warning if fever
    if (objTemp > 38.0) {
        display.fillRect(90, 45, 38, 15, SH110X_WHITE);
        display.setTextColor(SH110X_BLACK);
        display.setCursor(95, 49);
        display.print("FEVRE");
        display.setTextColor(SH110X_WHITE);
    }

    display.display();
}

// =============================================
// SCREEN: Heart Rate (MAX30102)
// =============================================
void drawHeartRateScreen() {
    display.clearDisplay();
    display.setTextColor(SH110X_WHITE);
    drawStatusBar();

    display.setTextSize(1);
    display.setCursor(5, 12);
    display.print("RYTHME CARDIAQUE:");

    // BPM Value
    display.setTextSize(3);
    display.setCursor(5, 25);
    if (beatAvg < 30) {
        display.print("--");
    } else {
        display.print(beatAvg);
    }
    
    display.setTextSize(1);
    display.setCursor(75, 40);
    display.print("BPM");

    // SpO2
    display.setCursor(100, 25);
    display.print("SpO2");
    display.setCursor(100, 35);
    if (beatAvg < 30) {
        display.print("--");
    } else {
        display.print(spo2Avg);
        display.print("%");
    }

    // RAW SIGNAL FEEDBACK (Useful for calibration)
    display.setTextSize(1);
    display.setCursor(5, 54);
    display.print("Signal: ");
    display.print(particleSensor.getIR());

    // Pulse Animation (Heart icon)
    if (millis() - lastBeat < 200) {
        display.fillCircle(115, 52, 5, SH110X_WHITE);
    } else {
        display.drawCircle(115, 52, 5, SH110X_WHITE);
    }

    display.display();
}

void sendTelemetry() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    char fullUrl[128];
    snprintf(fullUrl, sizeof(fullUrl), "%s/%s/telemetry", serverUrl, braceletID);
    
    http.begin(fullUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"heartRate\":" + String(beatAvg) + ",";
    json += "\"spo2\":" + String(spo2Avg) + ",";
    json += "\"battery\":" + String(85) + ","; // Mock battery
    json += "\"status\":\"online\"";
    json += "}";

    int httpResponseCode = http.POST(json);
    
    Serial.print("--- TELEMETRY --- ID: ");
    Serial.println(braceletID);
    Serial.print("Payload: ");
    Serial.println(json);
    Serial.print("Response Code: ");
    Serial.println(httpResponseCode);
    
    http.end();
}

// =============================================
// SCREEN: Fever Alert (High Vis)
// =============================================
void drawTempAlertScreen() {
    display.clearDisplay();
    
    float objTemp = mlx.readObjectTempC();
    float ambTemp = mlx.readAmbientTempC();

    // 1. Draw Detailed Data (Background)
    display.setTextColor(SH110X_WHITE);
    drawStatusBar();
    display.setTextSize(1);
    display.setCursor(5, 12);
    display.print("TEMPERATURE:");
    display.setTextSize(2);
    display.setCursor(5, 25);
    display.print(objTemp, 1);
    display.print(" C");
    display.setTextSize(1);
    display.setCursor(85, 25);
    display.print("(OBJ)");
    display.setCursor(5, 48);
    display.print("Ambiante: ");
    display.print(ambTemp, 1);
    display.print(" C");

    // 2. High-Visibility Alert Banner (Flashing)
    if ((millis() / 500) % 2 == 0) {
        display.fillRect(0, 0, 128, 12, SH110X_WHITE);
        display.setTextColor(SH110X_BLACK);
        display.setCursor(20, 2);
        display.print("!!! ALERTE FIEVRE !!!");
        
        // Also flash the big value
        display.fillRect(4, 24, 80, 18, SH110X_WHITE);
        display.setCursor(5, 25);
        display.setTextSize(2);
        display.print(objTemp, 1);
        display.print(" C");
    }

    display.display();
}


void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (len < (int)sizeof(struct_message)) return;
    struct_message temp;
    memcpy(&temp, incomingData, sizeof(temp));
    
    bool found = false;
    int firstEmpty = -1;

    for (int i = 0; i < 5; i++) {
        if (nearbyTrucks[i].active && strcmp(nearbyTrucks[i].truckID, temp.truckID) == 0) {
            nearbyTrucks[i].speed = temp.speed;
            nearbyTrucks[i].lastSeen = millis();
            found = true;
            break;
        }
        if (!nearbyTrucks[i].active && firstEmpty == -1) firstEmpty = i;
    }

    if (!found && firstEmpty != -1) {
        strcpy(nearbyTrucks[firstEmpty].truckID, temp.truckID);
        nearbyTrucks[firstEmpty].speed = temp.speed;
        nearbyTrucks[firstEmpty].lastSeen = millis();
        nearbyTrucks[firstEmpty].active = true;
    }

    // Always update main display with latest data
    memcpy(&incomingReadings, &temp, sizeof(incomingReadings));
    isAlarmActive = true;
    lastAlarmTime = millis();
    
    Serial.print("ESP-NOW DATA RECV: ");
    Serial.print(temp.truckID);
    Serial.print(" | Speed: ");
    Serial.println(temp.speed);
    
    digitalWrite(LED_INDICATOR_PIN, HIGH);
}

void setup() {
    Serial.begin(115200);
    Wire.begin(I2C_SDA, I2C_SCL);
    
    if(!display.begin(0x3C, true)) {
        Serial.println("OLED Fail");
    }

    if (!mlx.begin()) {
        Serial.println("MLX90614 Fail");
    }

    // Initialize MAX30102
    if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
        Serial.println("MAX30102 Fail");
    } else {
        // ULTRA SENSITIVITY FIX : 100Hz / 411us (Correct pair)
        byte ledBrightness = 0xFF; // Full Power
        byte sampleAverage = 1;    // No averaging
        byte ledMode = 2;          // Red + IR
        int sampleRate = 100;      // 100Hz is reliable
        int pulseWidth = 411;      // 411us
        int adcRange = 16384;      // Max range
        
        particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
    }

    // 1. Logo (128x64) - Réduit à 1.5s
    display.clearDisplay();
    display.drawBitmap(0, 0, logo_bmp, 128, 64, SH110X_WHITE);
    display.display();
    delay(1500);

    // 2. Brand Name - Réduit à 1s
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(15, 20);
    display.print("INOVARIA");
    display.setCursor(45, 40);
    display.print("TECH");
    display.display();
    delay(1000);

    pinMode(ALARM_VIBRATOR_PIN, OUTPUT);
    pinMode(ALARM_BUZZER_PIN, OUTPUT);
    pinMode(LED_INDICATOR_PIN, OUTPUT);
    digitalWrite(ALARM_VIBRATOR_PIN, LOW);
    digitalWrite(ALARM_BUZZER_PIN, LOW);
    digitalWrite(LED_INDICATOR_PIN, LOW);
    
    // Generate Bracelet ID BEFORE displaying WiFi screen
    WiFi.mode(WIFI_STA);
    uint8_t macAddress[6];
    WiFi.macAddress(macAddress);
    snprintf(braceletID, sizeof(braceletID), "BRAC_%02x%02x", macAddress[4], macAddress[5]);

    // Connect to WiFi (lancement avant l'affichage)
    WiFi.begin(ssid, password);

    // 3. WiFi Status (Displaying actual ID)
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(10, 10);
    display.print("Connexion WiFi...");
    display.setCursor(10, 28);
    display.print("ID: ");
    display.print(braceletID);
    display.display();

    Serial.println("================================");
    Serial.print("BRACELET ID: ");
    Serial.println(braceletID);
    Serial.println("================================");

    // Attendre la connexion WiFi (max 5s)
    unsigned long wifiStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 5000) {
        delay(250);
        Serial.print(".");
    }

    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(10, 10);
    if (WiFi.status() == WL_CONNECTED) {
        display.print("WiFi: OK");
        Serial.println("\nWiFi connecte!");
    } else {
        display.print("WiFi: HORS LIGNE");
        Serial.println("\nWiFi non connecte - mode offline");
    }
    display.setCursor(10, 28);
    display.print("ID: ");
    display.print(braceletID);
    display.setCursor(10, 45);
    display.print("Pret!");
    display.display();
    delay(1000);

    if (esp_now_init() == ESP_OK) {
        esp_now_register_recv_cb(OnDataRecv);
    }
}

void loop() {
    // Clock Logic
    if (millis() - lastClockUpdate > 60000) {
        minute++;
        if (minute >= 60) { minute = 0; hour++; }
        if (hour >= 24) hour = 0;
        lastClockUpdate = millis();
    }

    // --- TRUCK LIST CLEANUP ---
    truckCount = 0;
    unsigned long now = millis();
    for (int i = 0; i < 5; i++) {
        if (nearbyTrucks[i].active) {
            if (now - nearbyTrucks[i].lastSeen > ALARM_DURATION_MS) {
                nearbyTrucks[i].active = false;
            } else {
                truckCount++;
            }
        }
    }
    if (truckCount == 0) isAlarmActive = false;

    if (isTempAlarmActive) {
        drawTempAlertScreen();
        // Steady vibration, fast buzzer
        digitalWrite(ALARM_VIBRATOR_PIN, HIGH);
        if ((millis() / 100) % 2 == 0) digitalWrite(ALARM_BUZZER_PIN, HIGH);
        else digitalWrite(ALARM_BUZZER_PIN, LOW);

        if (millis() - lastTempAlarmTime > 5000) { // 5s fever alert
            isTempAlarmActive = false;
            digitalWrite(ALARM_VIBRATOR_PIN, LOW);
            digitalWrite(ALARM_BUZZER_PIN, LOW);
        }
    } else if (isAlarmActive) {
        drawAlertScreen();
        // Beeping Pattern (Active only during detection)
        if ((millis() / 500) % 2 == 0) { // Periodic pulse every 1s
            digitalWrite(ALARM_BUZZER_PIN, HIGH);
            digitalWrite(ALARM_VIBRATOR_PIN, HIGH);
        } else {
            digitalWrite(ALARM_BUZZER_PIN, LOW);
            digitalWrite(ALARM_VIBRATOR_PIN, LOW);
        }
        if (millis() - lastAlarmTime > ALARM_DURATION_MS) {
            isAlarmActive = false;
            digitalWrite(ALARM_BUZZER_PIN, LOW);
            digitalWrite(ALARM_VIBRATOR_PIN, LOW);
        }
    } else {
        // High-end UI cycling throttled to 200ms
        static unsigned long lastDisplayUpdate = 0;
        if (millis() - lastDisplayUpdate > 200) { 
            float currentTemp = mlx.readObjectTempC();
            if (currentTemp > TEMP_THRESHOLD && !isTempAlarmActive) {
                isTempAlarmActive = true;
                lastTempAlarmTime = millis();
            }

            int rotation = (millis() / 5000) % 3;
            long irValue = particleSensor.getIR();
            // SEUIL CORRECT : sans doigt < 5000, avec doigt > 50000
            bool fingerDetected = (irValue > 50000);

            if (fingerDetected) {
                drawHeartRateScreen();
            } else {
                if (rotation == 0) drawHomeScreen();
                else if (rotation == 1) drawTemperatureScreen();
                else drawHeartRateScreen();
            }
            lastDisplayUpdate = millis();
        }

        // --- HEART RATE & SpO2 SENSING ---
        long irValue = particleSensor.getIR();
        long redValue = particleSensor.getRed();
        // SEUIL CORRECT : sans doigt < 5000, avec doigt > 50000
        bool fingerDetected = (irValue > 50000);
        
        yield(); // Let WiFi stack breathe

        if (!fingerDetected) {
            // Reset quand le doigt est retiré
            beatAvg = 0;
            spo2Avg = 0;
            bpm = 0;
            rateSpot = 0;
            spo2Spot = 0;
            memset(rates, 0, sizeof(rates));
            memset(spo2Values, 0, sizeof(spo2Values));
            if (millis() % 3000 < 50) { // Log toutes les 3s
                Serial.print("En attente doigt... IR: ");
                Serial.println(irValue);
            }
        } else {
            // Doigt detecte - lecture battement
            if (checkForBeat(irValue) == true) {
                long delta = millis() - lastBeat;
                lastBeat = millis();
                
                // Ignorer le premier battement (delta peut être incorrect)
                if (delta > 0 && lastBeat != 0) {
                    bpm = 60000.0 / (float)delta; // delta en ms
                    
                    if (bpm < 220 && bpm > 30) { // Plage physiologique valide
                        rates[rateSpot++] = (byte)bpm;
                        rateSpot %= RATE_SIZE;
                        
                        // Moyenne uniquement des valeurs non-nulles
                        int validCount = 0;
                        long beatSum = 0;
                        for (byte x = 0; x < RATE_SIZE; x++) {
                            if (rates[x] > 0) { beatSum += rates[x]; validCount++; }
                        }
                        if (validCount > 0) beatAvg = beatSum / validCount;

                        // SpO2 : ratio R = (AC_red/DC_red) / (AC_ir/DC_ir)
                        // Approximation simple avec ratio red/IR
                        if (irValue > 0) {
                            float ratio = (float)redValue / (float)irValue;
                            int currentSpo2 = (int)(110.0 - 25.0 * ratio);
                            if (currentSpo2 > 100) currentSpo2 = 100;
                            if (currentSpo2 < 85) currentSpo2 = 85; // Min physiologique

                            spo2Values[spo2Spot++] = currentSpo2;
                            spo2Spot %= SPO2_SIZE;

                            int spo2ValidCount = 0;
                            long spo2Sum = 0;
                            for (byte x = 0; x < SPO2_SIZE; x++) {
                                if (spo2Values[x] > 0) { spo2Sum += spo2Values[x]; spo2ValidCount++; }
                            }
                            if (spo2ValidCount > 0) spo2Avg = spo2Sum / spo2ValidCount;
                        }
                        
                        Serial.print("BPM: "); Serial.print(beatAvg);
                        Serial.print(" | SpO2: "); Serial.print(spo2Avg);
                        Serial.print("% | IR: "); Serial.println(irValue);
                    }
                }
            }
        }

        // --- TELEMETRY ---
        if (millis() - lastTelemetryTime > TELEMETRY_INTERVAL) {
            lastTelemetryTime = millis(); // Mettre à jour en premier pour éviter re-entrée
            float bodyTemp = mlx.readObjectTempC();
            if (WiFi.status() == WL_CONNECTED) {
                HTTPClient http;
                char fullUrl[128];
                snprintf(fullUrl, sizeof(fullUrl), "%s/%s/telemetry", serverUrl, braceletID);
                http.begin(fullUrl);
                http.setTimeout(4000); // FIX: Timeout 4s pour éviter de bloquer le loop
                http.addHeader("Content-Type", "application/json");

                String json = "{";
                json += "\"heartRate\":" + String(beatAvg) + ",";
                json += "\"spo2\":" + String(spo2Avg) + ",";
                json += "\"temperature\":" + String(bodyTemp, 1) + ",";
                json += "\"battery\":85,";
                json += "\"status\":\"online\"";
                json += "}";

                int httpResponseCode = http.POST(json);
                Serial.print("[TELEMETRY] BPM:"); Serial.print(beatAvg);
                Serial.print(" SpO2:"); Serial.print(spo2Avg);
                Serial.print("% Temp:"); Serial.print(bodyTemp, 1);
                Serial.print("C Code:"); Serial.println(httpResponseCode);
                http.end();
            } else {
                Serial.println("[TELEMETRY] WiFi non connecte - skip");
            }
        }

        // Ensure indicators are off if no alarm
        digitalWrite(ALARM_VIBRATOR_PIN, LOW);
        digitalWrite(ALARM_BUZZER_PIN, LOW);
        digitalWrite(LED_INDICATOR_PIN, LOW);
    }
    delay(10); // Mandatory yield to prevent Watchdog reset and stabilize Power
}
