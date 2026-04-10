#include "SIM808Service.h"
#include <Arduino.h>
#include <esp_task_wdt.h>

#ifndef TINY_GSM_MODEM_SIM808
#define TINY_GSM_MODEM_SIM808
#endif

namespace Infrastructure {

SIM808Service::SIM808Service()
    : gpsEnabled(false), networkRegistered(false), gprsConnected(false),
      mqttConnected(false), lastGprsReconnectAttempt(0),
      lastMqttReconnectAttempt(0), gprsReconnectAttempts(0),
      mqttReconnectAttempts(0), signalQuality(0), lastSignalCheck(0),
      gprsDisconnectCount(0), lastGprsCheck(0), lastSpeed(0.0f),
      motionUnlocked(false) {

  serial = new HardwareSerial(SIM808_UART_NUM);
  serial->begin(SIM808_BAUD_RATE, SERIAL_8N1, SIM808_UART_RX, SIM808_UART_TX);

  modem = new TinyGsm(*serial);
  gsmClient = new TinyGsmClient(*modem);
  mqtt = new PubSubClient(*gsmClient);

  // Configure MQTT client with conservative settings
  mqtt->setServer(MQTT_BROKER, MQTT_PORT);
  mqtt->setBufferSize(512);   // Large buffer for JSON
  mqtt->setKeepAlive(60);     // 60 second keepalive (longer for cellular)
  mqtt->setSocketTimeout(15); // 15 second timeout (GPRS needs time)

  Serial.println(
      "[SIM808] Service created: 512B buffer, 60s keepalive, 15s timeout");
}

SIM808Service::~SIM808Service() {
  delete mqtt;
  delete gsmClient;
  delete modem;
  delete serial;
}

bool SIM808Service::initialize() {
  Serial.println("========================================");
  Serial.println("[SIM808] Starting initialization...");
  Serial.println("========================================");

  resetConnectionState();

  // Step 1: Check if modem is already powered on
  Serial.println("[SIM808] Step 1/5: Checking modem status...");
  if (modem->testAT()) {
    Serial.println("[SIM808] ✓ Modem already powered and responding");
  } else {
    Serial.println("[SIM808] Modem not responding, toggling power...");
    powerOn();
    esp_task_wdt_reset();

    delay(3000); // Wait for modem to fully boot
    esp_task_wdt_reset();

    if (!modem->testAT()) {
      Serial.println("[SIM808] ✗ Modem still not responding!");
      return false;
    }
    Serial.println("[SIM808] ✓ Modem powered on successfully");
  }

  // Step 2: Initialize modem
  Serial.println("[SIM808] Step 2/5: Initializing modem...");
  if (!modem->init()) {
    Serial.println(
        "[SIM808] ⚠ Modem init returned false, continuing anyway...");
  }
  esp_task_wdt_reset();

  // Get modem info
  String modemInfo = modem->getModemInfo();
  Serial.print("[SIM808] Modem: ");
  Serial.println(modemInfo);

  // Step 3: Wait for network registration
  Serial.println("[SIM808] Step 3/5: Waiting for network registration...");
  if (!waitForNetwork()) {
    Serial.println("[SIM808] ✗ Network registration failed");
    return false;
  }
  Serial.println("[SIM808] ✓ Network registered");
  networkRegistered = true;

  // Step 4: Check signal quality
  Serial.println("[SIM808] Step 4/5: Checking signal quality...");
  if (!checkSignalQuality()) {
    Serial.println("[SIM808] ⚠ Poor signal quality, but continuing...");
  }

  // Step 5: Connect to GPRS
  Serial.println("[SIM808] Step 5/5: Connecting to GPRS...");
  if (!connectToGPRS()) {
    Serial.println("[SIM808] ✗ GPRS connection failed");
    return false;
  }
  Serial.println("[SIM808] ✓ GPRS connected");

  Serial.println("========================================");
  Serial.println("[SIM808] ✓ Initialization complete!");
  Serial.println("========================================");

  return true;
}

void SIM808Service::powerOn() {
  Serial.println("[SIM808] Power sequence starting...");
  pinMode(SIM808_PWR_KEY_PIN, OUTPUT);

  // Ensure pin starts HIGH (released)
  digitalWrite(SIM808_PWR_KEY_PIN, HIGH);
  delay(300);
  esp_task_wdt_reset();

  // Press PWRKEY for 2 seconds
  Serial.println("[SIM808] Pressing power key (2 seconds)...");
  digitalWrite(SIM808_PWR_KEY_PIN, LOW);
  delay(2000);
  esp_task_wdt_reset();

  // Release PWRKEY
  digitalWrite(SIM808_PWR_KEY_PIN, HIGH);
  Serial.println("[SIM808] Power key released");

  // Wait for module to boot
  Serial.print("[SIM808] Waiting for boot");
  for (int i = 0; i < 5; i++) {
    delay(1000);
    Serial.print(".");
    esp_task_wdt_reset();
  }
  Serial.println(" Done!");
}

bool SIM808Service::waitForNetwork() {
  Serial.println("[SIM808] Waiting for network (max 60s)...");

  int attempts = 0;
  const int maxAttempts = 30; // 30 attempts x 2 seconds = 60 seconds max

  while (attempts < maxAttempts) {
    esp_task_wdt_reset();

    int networkStatus = modem->getRegistrationStatus();

    switch (networkStatus) {
    case 1:
      Serial.println("[SIM808] ✓ Registered on home network");
      return true;
    case 5:
      Serial.println("[SIM808] ✓ Registered on roaming network");
      return true;
    case 2:
      Serial.println("[SIM808] Searching for network...");
      break;
    case 3:
      Serial.println("[SIM808] Network registration denied");
      return false;
    case 0:
    default:
      Serial.print("[SIM808] Not registered (status: ");
      Serial.print(networkStatus);
      Serial.println(")");
      break;
    }

    delay(2000);
    attempts++;

    if (attempts % 5 == 0) {
      Serial.print("[SIM808] Still waiting... (");
      Serial.print(attempts * 2);
      Serial.println("s elapsed)");
    }
  }

  Serial.println("[SIM808] ✗ Network registration timeout");
  return false;
}

bool SIM808Service::checkSignalQuality() {
  signalQuality = modem->getSignalQuality();

  const char *bars = "▂    ";
  if (signalQuality == 99)
    bars = "✖ ";
  else if (signalQuality >= 22)
    bars = "▂▄▆█ ";
  else if (signalQuality >= 14)
    bars = "▂▄▆  ";
  else if (signalQuality >= 7)
    bars = "▂▄   ";

  Serial.print("[SIM808] Signal: ");
  Serial.print(bars);
  Serial.print("(");
  Serial.print(signalQuality);
  Serial.print("/31) - ");

  if (signalQuality == 99) {
    Serial.println("Unknown");
    return false;
  } else if (signalQuality < 10) {
    Serial.println("Poor");
    return false;
  } else if (signalQuality < 20) {
    Serial.println("Fair");
    return true;
  } else {
    Serial.println("Good");
    return true;
  }
}

bool SIM808Service::connectToGPRS() {
  Serial.print("[GPRS] Connecting to APN: ");
  Serial.println(APN_NAME);

  esp_task_wdt_reset();

  unsigned long startTime = millis();
  bool result = modem->gprsConnect(APN_NAME, GPRS_USER, GPRS_PASS);
  unsigned long duration = millis() - startTime;

  esp_task_wdt_reset();

  if (result) {
    gprsConnected = true;
    gprsReconnectAttempts = 0; // Reset counter on success

    Serial.print("[GPRS] ✓ Connected in ");
    Serial.print(duration);
    Serial.println("ms");

    // Get and display local IP
    String ipAddress = modem->getLocalIP();
    Serial.print("[GPRS] IP Address: ");
    Serial.println(ipAddress);

    return true;
  } else {
    gprsConnected = false;
    gprsReconnectAttempts++;

    Serial.print("[GPRS] ✗ Failed after ");
    Serial.print(duration);
    Serial.print("ms (attempt ");
    Serial.print(gprsReconnectAttempts);
    Serial.println(")");

    return false;
  }
}

bool SIM808Service::connectToMQTT() {
  if (!gprsConnected) {
    Serial.println("[MQTT] Cannot connect - GPRS not connected");
    return false;
  }
  // Generate unique client ID
  // String clientId = "esp32_truck_";
  // clientId += String(random(0xffff), HEX);
  // Generate unique client ID
  String clientId = "esp32_truck_";
  clientId += String(random(0xffff), HEX);

  Serial.println("----------------------------------------");
  Serial.print("[MQTT] Client ID: ");
  Serial.println(clientId);
  Serial.print("[MQTT] Broker: ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  Serial.print("[MQTT] User: ");
  Serial.println(MQTT_USER);

  esp_task_wdt_reset();

  unsigned long startTime = millis();
  // Use a while loop or internal mechanism that resets WDT if possible,
  // but here we just ensure we reset before and after the blocking call.
  bool result = mqtt->connect(clientId.c_str(), MQTT_USER, MQTT_PASS, NULL, 0,
                              false, NULL, true);

  esp_task_wdt_reset();
  unsigned long duration = millis() - startTime;

  if (result) {
    mqttConnected = true;
    mqttReconnectAttempts = 0; // Reset counter on success

    Serial.print("[MQTT] ✓ Connected in ");
    Serial.print(duration);
    Serial.println("ms");

    // Subscribe to commands topic
    subscribe(MQTT_TOPIC_COMMANDS);

    Serial.println("----------------------------------------");

    return true;
  } else {
    mqttConnected = false;
    mqttReconnectAttempts++;

    int state = mqtt->state();
    Serial.print("[MQTT] ✗ Failed after ");
    Serial.print(duration);
    Serial.print("ms, state: ");
    Serial.print(state);
    Serial.print(" (attempt ");
    Serial.print(mqttReconnectAttempts);
    Serial.println(")");

    // Explain the error
    switch (state) {
    case -4:
      Serial.println("[MQTT] Error: Connection timeout");
      break;
    case -3:
      Serial.println("[MQTT] Error: Connection lost");
      break;
    case -2:
      Serial.println("[MQTT] Error: Connect failed");
      break;
    case -1:
      Serial.println("[MQTT] Error: Disconnected");
      break;
    case 1:
      Serial.println("[MQTT] Error: Bad protocol");
      break;
    case 2:
      Serial.println("[MQTT] Error: Bad client ID");
      break;
    case 3:
      Serial.println("[MQTT] Error: Broker unavailable");
      break;
    case 4:
      Serial.println("[MQTT] Error: Bad credentials");
      break;
    case 5:
      Serial.println("[MQTT] Error: Unauthorized");
      break;
    default:
      Serial.println("[MQTT] Error: Unknown");
      break;
    }
    Serial.println("----------------------------------------");

    return false;
  }
}

void SIM808Service::setCallback(void (*callback)(char *, uint8_t *,
                                                 unsigned int)) {
  mqtt->setCallback(callback);
}

bool SIM808Service::subscribe(const char *topic) {
  if (mqtt->subscribe(topic)) {
    Serial.print("[MQTT] Subscribed to: ");
    Serial.println(topic);
    return true;
  } else {
    Serial.print("[MQTT] ✗ Failed to subscribe to: ");
    Serial.println(topic);
    return false;
  }
}

bool SIM808Service::enableGPS() {
  Serial.println("[GPS] Enabling...");

  // Force GNSS power on explicitly for SIM808
  modem->sendAT("+CGNSPWR=1");
  if (modem->waitResponse(10000L) != 1) {
    Serial.println("[GPS] ⚠ +CGNSPWR=1 warning");
  }

  // --- Hardware Static Navigation Filter ---
  // $PMTK386,0.3*3E sets the speed threshold to 0.3 m/s (~1.08 km/h)
  // This instructs the GNSS chip to ignore speeds below this threshold.
  modem->sendAT("+CGNSCMD=0,\"$PMTK386,0.3*3E\"");
  modem->waitResponse(2000L);

  if (modem->enableGPS()) {
    gpsEnabled = true;
    esp_task_wdt_reset();
    Serial.println("[GPS] ✓ Enabled successfully");
    return true;
  }

  Serial.println("[GPS] ✗ Enable failed");
  return false;
}

Domain::GPSCoordinates SIM808Service::getGPSPosition(bool isStationary) {
  Domain::GPSCoordinates coords;

  if (!gpsEnabled) {
    return coords;
  }

  float lat, lon, speed, alt, accuracy;
  int vsat, usat, year, month, day, hour, minute, second;

  bool success =
      modem->getGPS(&lat, &lon, &speed, &alt, &vsat, &usat, &accuracy, &year,
                    &month, &day, &hour, &minute, &second);

  esp_task_wdt_reset();

  // Relaxed check: Accept if lat/lon are valid, even if usat is low
  // (Indoor/GNSS mode)
  if (success && lat != 0.0f && lon != 0.0f) {
    coords.latitude = lat;
    coords.longitude = lon;

    // --- GPS Drift Filtering & Smoothing ---
    // 1. Apply Exponential Moving Average (EMA) to smooth the raw jitter
    lastSpeed = (GPS_SPEED_SMOOTHING_ALPHA * speed) +
                ((1.0f - GPS_SPEED_SMOOTHING_ALPHA) * lastSpeed);

    // 2. AUTOMATIC MOTION DETECTION (for testing without gear wires)
    // If raw speed > 2.5km/h, we "unlock" the sensitive filter even in Neutral.
    if (speed > 2.5f) {
      motionUnlocked = true;
    } else if (speed < 0.5f) {
      // Re-lock when virtually stopped
      motionUnlocked = false;
    }

    // 3. Adaptive Filtering based on expected movement
    // We only use strict filter if Gear is Neutral AND no motion is
    // auto-detected
    bool effectiveIsStationary = isStationary && !motionUnlocked;
    float effectiveThreshold = effectiveIsStationary
                                   ? (GPS_MIN_SPEED_THRESHOLD * 2.0f)
                                   : GPS_MIN_SPEED_THRESHOLD;

    if (lastSpeed < effectiveThreshold) {
      // Force to 0 for very slow values or when stationary
      coords.speed = 0.0f;
      lastSpeed = 0.0f;
    } else if (effectiveIsStationary && usat < GPS_MIN_SATS_RELIABLE &&
               lastSpeed < 5.0f) {
      // In stationary mode with poor signal, filter jumps up to 5km/h
      coords.speed = 0.0f;
    } else {
      // Valid movement (detected even at 1-2 km/h when gear engaged or
      // auto-unlocked)
      coords.speed = lastSpeed;
    }

    coords.altitude = alt;
    coords.satellites = usat;
    coords.accuracy = accuracy;
  }

  return coords;
}

bool SIM808Service::sendData(const char *topic, const char *payload) {
  if (!gprsConnected)
    return false;

  // If MQTT is down but GPRS is up, try one immediate connection attempt (no
  // wait)
  if (!mqtt->connected()) {
#if DEBUG_GSM_CONNECTION
    Serial.println("[MQTT] Not connected, attempting quick join...");
#endif
    if (!connectToMQTT())
      return false;
  }

  esp_task_wdt_reset();
  bool result = mqtt->publish(topic, payload);
  esp_task_wdt_reset();

  if (result) {
#if DEBUG_TELEMETRY
    Serial.print("[MQTT] ✓ Published to ");
    Serial.println(topic);
#endif
  }

  return result;
}

void SIM808Service::maintainConnection() {
  unsigned long currentTime = millis();

  // Check signal quality every 5 seconds
  if (currentTime - lastSignalCheck >= 5000) {
    checkSignalQuality();
    lastSignalCheck = currentTime;
  }

  // Check GPRS status with debouncing (only every 5 seconds to avoid flaky
  // readings)
  if (currentTime - lastGprsCheck >= 5000) {
    lastGprsCheck = currentTime;

    bool gprsActive = modem->isGprsConnected();

    if (!gprsActive) {
      gprsDisconnectCount++;

      // Only mark as disconnected after 3 consecutive failed checks (15
      // seconds)
      if (gprsDisconnectCount >= 3) {
        if (gprsConnected) {
          // Confirmed GPRS loss after multiple checks
          Serial.println("[GPRS] Connection lost (confirmed)!");
          gprsConnected = false;
          mqttConnected = false;
        }

        // Calculate backoff time: min(30s * 2^attempts, 300s)
        unsigned long backoffTime =
            min(30000UL * (1 << min(gprsReconnectAttempts, 3)), 300000UL);

        if (currentTime - lastGprsReconnectAttempt >= backoffTime) {
          Serial.println("[GPRS] Attempting reconnect...");
          lastGprsReconnectAttempt = currentTime;

          // Check network registration before attempting GPRS
          if (!modem->isNetworkConnected()) {
            Serial.println("[SIM808] Network not registered, waiting...");
            gprsReconnectAttempts++;
            esp_task_wdt_reset();
            return;
          }

          if (connectToGPRS()) {
            Serial.println("[GPRS] ✓ Reconnected successfully!");
            gprsConnected = true;
            gprsDisconnectCount = 0; // Reset counter
            // Reset MQTT state so it will reconnect
            mqttConnected = false;
          } else {
            Serial.print("[GPRS] ✗ Reconnect failed, next attempt in ");
            Serial.print(backoffTime / 1000);
            Serial.println(" seconds");
          }

          esp_task_wdt_reset();
        }
      }
      // If disconnect count < 3, ignore (likely false reading)

    } else {
      // GPRS is connected
      if (!gprsConnected) {
        Serial.println("[GPRS] Connection restored");
        gprsConnected = true;
      }
      gprsDisconnectCount = 0; // Reset counter on successful check
    }
  }

  // MQTT reconnection with cooldown (only if GPRS is likely connected)
  if (gprsConnected && !mqtt->connected()) {
    if (mqttConnected) {
      // First detection of MQTT loss
      Serial.println("[MQTT] Connection lost!");
      mqttConnected = false;
    }

    // Reconnect immediately if GPRS is up but MQTT is down
    Serial.println("[MQTT] Reconnecting...");
    lastMqttReconnectAttempt = currentTime;

    if (connectToMQTT()) {
      Serial.println("[MQTT] ✓ Reconnected successfully!");
      mqttConnected = true;
    }

    esp_task_wdt_reset();
  } else if (mqtt->connected()) {
    // MQTT is connected
    if (!mqttConnected) {
      Serial.println("[MQTT] Connection restored");
      mqttConnected = true;
    }
  }

  // Run MQTT loop if connected
  if (mqttConnected) {
    mqtt->loop();
  }

  esp_task_wdt_reset();
}

bool SIM808Service::isConnected() {
  return gprsConnected && mqttConnected && mqtt->connected();
}

void SIM808Service::resetConnectionState() {
  networkRegistered = false;
  gprsConnected = false;
  mqttConnected = false;
  gprsReconnectAttempts = 0;
  mqttReconnectAttempts = 0;
  signalQuality = 0;
  lastGprsReconnectAttempt = 0;
  lastMqttReconnectAttempt = 0;
  lastSignalCheck = 0;
  gprsDisconnectCount = 0;
  lastGprsCheck = 0;
}

String SIM808Service::fetchCalibration(const char *deviceId) {
  if (!gprsConnected)
    return "";

  char url[128];
  snprintf(url, sizeof(url), "%s/api/calibration/%s", BACKEND_BASE_URL,
           deviceId);

  Serial.print("[HTTP] Fetching calibration from: ");
  Serial.println(url);

  // Using AT commands directly for simplicity with TinyGSM or TinyGsmClient
  // TinyGSM has a more complex HTTP wrapper, but we can use TinyGsmClient for a
  // simple GET
  TinyGsmClient client(*modem);
  const int port = BACKEND_PORT;

  if (!client.connect(BACKEND_HOST, port)) {
    Serial.println("[HTTP] Connection failed");
    return "";
  }

  client.print(String("GET /api/calibration/") + deviceId + " HTTP/1.1\r\n" +
               "Host: " + BACKEND_HOST + "\r\n" + "Connection: close\r\n\r\n");

  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 10000L) {
    if (client.available()) {
      // Skip headers
      if (client.find("\r\n\r\n")) {
        String body = client.readString();
        Serial.println("[HTTP] ✓ Calibration received");
        client.stop();
        return body;
      }
    }
  }

  client.stop();
  Serial.println("[HTTP] ✗ Fetch timeout or error");
  return "";
}

bool SIM808Service::sendTelemetryHTTP(const char *payload) {
  if (!gprsConnected)
    return false;

  TinyGsmClient client(*modem);
  if (!client.connect(BACKEND_HOST, BACKEND_PORT)) {
    Serial.println("[HTTP] ✗ Connection to backend failed");
    return false;
  }

  Serial.print("[HTTP] Sending telemetry to: ");
  Serial.println(BACKEND_HOST);

  client.print(String("POST /api/telemetry HTTP/1.1\r\n") + "Host: " +
               BACKEND_HOST + "\r\n" + "Content-Type: application/json\r\n" +
               "Content-Length: " + strlen(payload) + "\r\n" +
               "Connection: close\r\n\r\n" + payload);

  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 5000L) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line.startsWith("HTTP/1.1 201") || line.startsWith("HTTP/1.1 200")) {
        Serial.println("[HTTP] ✓ Telemetry sent successfully");
        client.stop();
        return true;
      }
    }
  }

  client.stop();
  Serial.println("[HTTP] ✗ sendTelemetryHTTP failed or timeout");
  return false;
}

} // namespace Infrastructure
