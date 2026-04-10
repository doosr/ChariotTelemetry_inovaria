#include <Arduino.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

// BSP - Board Support Package (Hardware Configuration)
#include "BSP.h"
// Domain Layer
#include "Domain/Entities/GPSCoordinates.h"
#include "Domain/Entities/TruckStatus.h"

// Business Layer
#include "Business/Services/EngineHoursCalculator.h"
#include "Business/UseCases/AlertManager.h"
#include "Business/UseCases/EngineMonitor.h"
#include "Business/UseCases/FuelTheftDetector.h"

// Infrastructure Layer
#include "Business/UseCases/ProximityMonitor.h"
#include "Infrastructure/Adapters/ADS1115Adapter.h"
#include "Infrastructure/Adapters/FuelLevelSensor.h"
#include "Infrastructure/Adapters/JSNSR04TSensor.h"
#include "Infrastructure/Adapters/NTCTemperatureSensor.h"
#include "Infrastructure/Adapters/OilPressureSensor.h"
#include "Infrastructure/Adapters/RPMSensor.h"
#include "Infrastructure/Services/SIM808Service.h"
#include <ArduinoJson.h>
#include <Infrastructure/Storage/NVSStorage.h>
#include <WiFi.h>
#include <esp_now.h>

// ========== GLOBAL OBJECTS (Dependency Injection) ==========
// Infrastructure instances
Infrastructure::NVSStorage *storage;
Infrastructure::ADS1115Adapter *adsAdapter;
Infrastructure::NTCTemperatureSensor *tempSensor;
Infrastructure::OilPressureSensor *oilSensor;
Infrastructure::FuelLevelSensor *fuelSensor;
Infrastructure::RPMSensor *rpmSensor;
Infrastructure::SIM808Service *gsmModem;
Infrastructure::JSNSR04TSensor *proximitySensor; // JSN-SR04T rear sensor
// Business instances
Business::EngineHoursCalculator *engineHoursCalc;
Business::AlertManager *alertManager;
Business::EngineMonitor *engineMonitor;
Business::FuelTheftDetector *fuelTheftDetector;
Business::ProximityMonitor *proximityMonitor; // Rear obstacle detection
// ========== FREERTOS QUEUES ==========
QueueHandle_t sensorDataQueue;
QueueHandle_t telemetryDataQueue;
QueueHandle_t failedTelemetryQueue; // Queue for failed telemetry to retry
SemaphoreHandle_t modemMutex;       // Mutex for SIM808 access
SemaphoreHandle_t serialMutex;      // Mutex for Serial logs
// ========== DATA STRUCTURES ==========
struct SensorData {
  Domain::TruckStatus status;
};
struct TelemetryData {
  Domain::TruckStatus status;
  Domain::GPSCoordinates gps;
  bool forcePublish;       // For alerts
  unsigned long timestamp; // Timestamp when data was captured
};
struct TelemetryQueueItem {
  TelemetryData data;
  char payload[1024];
  uint8_t retryCount;
};
// ========== GLOBAL STATE ==========
char DEVICE_ID[32]; // e.g. truck_A3F2 - auto-generated from chip MAC at startup
Domain::GPSCoordinates lastGPSPosition;
unsigned long lastSaveTime = 0;
unsigned long lastTelemetryTime = 0;
unsigned long lastProximityBroadcast = 0;
// Structure for ESP-NOW proximity broadcast
typedef struct struct_proximity {
  char truckID[32];
  float speed;
  int status;
} struct_proximity;
// ========== TASK 1: SENSOR ACQUISITION ==========
void Task_Acquisition(void *parameter) {
  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency =
      pdMS_TO_TICKS(GEAR_READ_INTERVAL_MS); // Run at fast speed

  unsigned long lastAnalogRead = 0;
  Domain::TruckStatus cachedStatus; // Cache slow values
  while (1) {
    unsigned long now = millis();
    // 1. Always Read Gears (Fast)
    int currentGear = 0;
    // Use logic from EngineMonitor but optimized here since we don't want to
    // read everything Or better: Modify EngineMonitor to accept partial update?
    // For safety, let's read everything but throttle the *sending* and *ADC*
    // inside if possible. Since EngineMonitor is opaque here, we will trust it
    // handles reading efficiently BUT, strictly speaking, reading ADC is slow.

    // BETTER APPROACH: Read everything at GEAR speed? No, ADC is slow.
    // We need to execute `engineMonitor` differently.
    // Assuming engineMonitor reads all. We can't easily change that without
    // refactoring EngineMonitor. Workaround: We will read status every time
    // (150ms). If this is too slow cause of ADC, we must optimize EngineMonitor
    // later.

    Domain::TruckStatus status = engineMonitor->readCurrentStatus(now);
    // Read rear proximity sensor (GPIO-based, fast — safe at 150ms cycle)
    static unsigned long lastProximityRead = 0;
    static float lastDist = -1.0f;

    if (now - lastProximityRead >= PROXIMITY_READ_INTERVAL_MS) {
      if (status.gear == -1) {
        lastDist = proximityMonitor->read(); // Raw read only
      } else {
        lastDist = -1.0f;
      }
      lastProximityRead = now;
    }
    status.proximityDistance_cm = lastDist;
    esp_task_wdt_reset(); // Reset WDT on Core 0
// Debug only every 2 seconds
#if DEBUG_SENSOR_READINGS
    static unsigned long lastNetworkLog = 0;
    if (now - lastNetworkLog > 500) {
      if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(50))) {
        // --- PROFESSIONAL GPS & NETWORK DISPLAY ---
        Serial.print("[GNSS] ");
        if (lastGPSPosition.latitude == 0.0f &&
            lastGPSPosition.longitude == 0.0f) {
          Serial.print("Searching... | ");
        } else {
          Serial.print("Fix: 3D | Lat: ");
          Serial.print(lastGPSPosition.latitude, 6);
          Serial.print(" | Lon: ");
          Serial.print(lastGPSPosition.longitude, 6);
          Serial.print(" | ");
        }
        Serial.print("Sats: ");
        Serial.print(lastGPSPosition.satellites < 10 ? "0" : "");
        Serial.print(lastGPSPosition.satellites);
        Serial.print(" | Speed: ");
        Serial.print(lastGPSPosition.speed, 1);
        Serial.println(" km/h");

        Serial.print("[GPRS] Signal: ");
        if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(100))) {
          if (gsmModem->isConnected()) {
            Serial.println("▂▄▆█ | Status: CONNECTED");
          } else {
            Serial.println("✖     | Status: DISCONNECTED");
          }
          xSemaphoreGive(modemMutex);
        } else {
          Serial.println("▂▄▆█ | Status: BUSY");
        }
        xSemaphoreGive(serialMutex);
      }
      lastNetworkLog = now;
    }

    // 2. Analog Sensors & Engine Status (Slower update: 2s)
    if (now - lastAnalogRead > 2000) {
      if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(50))) {
        Serial.print("[SENSORS] Gear: ");
        Serial.print(status.gear == 1 ? "AV"
                                      : (status.gear == -1 ? "AR" : "N"));
        Serial.print(" | Temp: ");
        if (status.temp_nc || isnan(status.engineTemperature)) {
          Serial.print("ERR");
        } else {
          Serial.print(status.engineTemperature, 1);
          Serial.print(" °C");
        }
        Serial.print(" | Oil: ");
        Serial.print(status.oilPressure, 2);
        Serial.print(" Bar");
        if (status.gear == -1) {
          Serial.print(" | Prox: ");
          if (status.proximityDistance_cm < 0)
            Serial.print("NC");
          else {
            Serial.print(status.proximityDistance_cm, 1);
            Serial.print(" cm");
          }
        }
        Serial.println();

        float fuelPercentage = (status.fuelLevel / FUEL_TANK_CAPACITY) * 100.0f;
        Serial.print("[FUEL] ");
        Serial.print(status.fuelLevel, 1);
        Serial.print(" L (");
        Serial.print(fuelPercentage, 1);
        Serial.print("%) | RPM: ");
        Serial.println(status.rpm);

        Serial.print("[ENGINE] Hours: ");
        Serial.print(status.engineHours / 3600.0f, 2);
        Serial.print(" h | Running: ");
        Serial.println(status.engineRunning ? "YES" : "NO");
        Serial.println("=====================================");
        Serial.println();
        xSemaphoreGive(serialMutex);
      }
      lastAnalogRead = now;
    }

#endif
    // Send to Business Logic task
    SensorData data = {status};
    xQueueSend(sensorDataQueue, &data, 0);
    // Yield
    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}
// ========== TASK 2: BUSINESS LOGIC ==========
void Task_Logic(void *parameter) {
  SensorData sensorData;
  while (1) {
    esp_task_wdt_reset();
    // Wait for sensor data with timeout to ensure task yields periodically
    if (xQueueReceive(sensorDataQueue, &sensorData, pdMS_TO_TICKS(100))) {
      Domain::TruckStatus &status = sensorData.status;
      // Check for alerts (Timeout increased to match GPRS timeout)
      if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(15000))) {
        engineMonitor->checkForAlerts(status);
        // Proximity alert (New Location - handles mutex safely here)
        if (status.gear == -1 && status.proximityDistance_cm >= 0) {
          proximityMonitor->check(status.proximityDistance_cm,
                                  status.timestamp);
        }
        xSemaphoreGive(modemMutex);
      } else {
        Serial.println("[LOGIC] Could not take mutex for alerts (modem busy)");
      }

      vTaskDelay(pdMS_TO_TICKS(5)); // Yield

      // Check for fuel theft
      if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(15000))) {
        fuelTheftDetector->checkForTheft(
            status.fuelLevel, lastGPSPosition.speed, status.timestamp);
        xSemaphoreGive(modemMutex);
      }

      vTaskDelay(pdMS_TO_TICKS(5)); // Yield after alerts
      vTaskDelay(pdMS_TO_TICKS(5)); // Yield after fuel check
      // Control Oil Pressure LED
      if (status.oilPressure >= 0.5f) {
        digitalWrite(OIL_PRESSURE_OK_LED_PIN, HIGH);
      } else {
        digitalWrite(OIL_PRESSURE_OK_LED_PIN, LOW);
      }
      // Determine telemetry strategy
      bool shouldPublish = false;
      static Domain::TruckStatus
          lastPublishedStatus; // Keep track of last sent data
      unsigned long currentTime = millis();
      unsigned long timeSinceLast = currentTime - lastTelemetryTime;
      // Check for significant changes
      bool significantChange = false;

      // 1. Gear Change
      if (status.gear != lastPublishedStatus.gear)
        significantChange = true;

      // 2. Engine State Change
      if (status.engineRunning != lastPublishedStatus.engineRunning)
        significantChange = true;

      // 3. Fuel Change (> Threshold)
      if (abs(status.fuelLevel - lastPublishedStatus.fuelLevel) >
          THRESHOLD_FUEL_LITERS)
        significantChange = true;

      // 4. Temp Change (> Threshold)
      if (abs(status.engineTemperature -
              lastPublishedStatus.engineTemperature) > THRESHOLD_TEMP_CELSIUS)
        significantChange = true;

      // 5. Proximity Change (Specifically when in Reverse)
      if (status.gear == -1) {
        // Send immediately if an obstacle is detected in alert/warning zones
        if (status.proximityDistance_cm > 0 &&
            status.proximityDistance_cm < PROXIMITY_WARNING_CM) {
          if (abs(status.proximityDistance_cm -
                  lastPublishedStatus.proximityDistance_cm) > 10.0f) {
            significantChange = true;
          }
        }
      }
      // Decision Logic
      if (significantChange) {
        // Send immediately (respecting min interval)
        if (timeSinceLast >= TELEMETRY_MIN_INTERVAL_MS) {
          shouldPublish = true;
        }
      } else {
        // Heartbeat (Keep Alive)
        if (status.engineRunning) {
          // Engine ON: publish every X seconds
          if (timeSinceLast >= TELEMETRY_ENGINE_ON_MS)
            shouldPublish = true;
        } else {
          // Engine OFF: publish less frequently
          if (timeSinceLast >= TELEMETRY_ENGINE_OFF_MS)
            shouldPublish = true;
        }
      }

      // Update reference if publishing
      if (shouldPublish) {
        lastPublishedStatus = status;
      }
      // If it's time to publish, send sensor data to Telemetry task
      // GPS will be read in Telemetry task to avoid blocking this task
      if (shouldPublish) {
        lastTelemetryTime = currentTime;
        // Send to Telemetry task (GPS will be read there)
        TelemetryData telemetry = {status, lastGPSPosition, false, currentTime};
        xQueueSend(telemetryDataQueue, &telemetry, 0);
      }
      // Periodic save to NVS (this can block, so yield after)
      if (currentTime - lastSaveTime >= NVS_SAVE_INTERVAL_MS) {
        engineHoursCalc->saveToStorage();
        lastSaveTime = currentTime;
        vTaskDelay(pdMS_TO_TICKS(10)); // Yield after NVS write
      }
    }
    // Always yield at end of loop iteration
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
// ========== TASK 3: TELEMETRY & COMMUNICATION ==========
void Task_Telemetry(void *parameter) {
  TelemetryData telemetry;
  TelemetryQueueItem failedItem;
  unsigned long successCount = 0;
  unsigned long failCount = 0;
  while (1) {
    // Maintain connection (protected by mutex)
    if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(1000))) {
      gsmModem->maintainConnection();
      xSemaphoreGive(modemMutex);
    }
    // First, try to resend any failed telemetry from the queue
    if (xQueueReceive(failedTelemetryQueue, &failedItem, 0)) {
#if DEBUG_TELEMETRY
      Serial.println("[TELEMETRY] Retrying failed message...");
      Serial.print("[TELEMETRY] Retry attempt: ");
      Serial.print(failedItem.retryCount + 1);
      Serial.print("/");
      Serial.println(TELEMETRY_MAX_RETRIES);
#endif
      bool success = false;
      if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(5000))) {
        success = gsmModem->sendData(MQTT_TOPIC_TELEMETRY, failedItem.payload);

        // FALLBACK: If MQTT retry fails, try direct HTTP POST
        if (!success) {
#if DEBUG_TELEMETRY
          Serial.println(
              "[TELEMETRY] MQTT retry failed, trying HTTP fallback...");
#endif
          success = ((Infrastructure::SIM808Service *)gsmModem)
                        ->sendTelemetryHTTP(failedItem.payload);
        }
        xSemaphoreGive(modemMutex);
      } else {
        Serial.println("[TELEMETRY] Could not take mutex for retry");
      }
      if (success) {
#if DEBUG_TELEMETRY
        Serial.println("[TELEMETRY] ✓ Retry successful!");
#endif
        successCount++;
      } else {
        failedItem.retryCount++;
        if (failedItem.retryCount < TELEMETRY_MAX_RETRIES) {
#if DEBUG_TELEMETRY
          Serial.println("[TELEMETRY] ✗ Retry failed, re-queuing...");
#endif
          xQueueSend(failedTelemetryQueue, &failedItem, 0);
          vTaskDelay(pdMS_TO_TICKS(TELEMETRY_RETRY_DELAY_MS));
        } else {
          Serial.println("[TELEMETRY] ✗ Max retries reached, message dropped!");
          failCount++;
        }
      }
    }
    // Check for new telemetry data
    if (xQueueReceive(telemetryDataQueue, &telemetry, pdMS_TO_TICKS(100))) {
      // Read GPS position (done here to avoid blocking BusinessLogic task)
      Domain::GPSCoordinates currentGPS;
      if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(2000))) {
        currentGPS = gsmModem->getGPSPosition(telemetry.status.gear == 0);

        xSemaphoreGive(modemMutex);
      } else {
        // Skip GPS update if mutex unavailable
        currentGPS = lastGPSPosition;
      }
      // Smart GPS: Only update if we have a valid fix and moved significantly
      if (currentGPS.isValid()) {
        float distance = currentGPS.distanceTo(lastGPSPosition);
        // Update GPS if moved more than threshold OR engine is running
        if (distance >= GPS_MOVEMENT_THRESHOLD_M ||
            telemetry.status.engineRunning) {
          lastGPSPosition = currentGPS;
          // Determine positioning mode: Outdoor if sats >= 4, else Indoor (GNSS
          // high-perf or poor GPS)
          lastGPSPosition.pos_mode =
              (currentGPS.satellites >= 4) ? "gps" : "gnss";
          telemetry.gps = lastGPSPosition;
#if DEBUG_GPS_DATA
          Serial.print("[GPS] Position updated: dist=");
          Serial.print(distance);
          Serial.print("m, sats=");
          Serial.println(currentGPS.satellites);
#endif
        } else {
          // Use last known position if stationary
          telemetry.gps = lastGPSPosition;
#if DEBUG_GPS_DATA
          Serial.print("[GPS] Stationary (dist=");
          Serial.print(distance);
          Serial.println("m)");
#endif
        }
      } else {
        // GPS fix not available, mark as searching or indoor if engine on
        telemetry.gps = lastGPSPosition;
        telemetry.gps.pos_mode =
            telemetry.status.engineRunning ? "gnss" : "gps";
#if DEBUG_GPS_DATA
        Serial.println("[GPS] No valid fix");
#endif
      }

      // Format JSON payload (Up to 1024 bytes)
      char payload[1024];

      // NAN is not valid JSON — always send null or a real number.
      char tempStr[12], oilStr[12], fuelStr[12], fuelPctStr[12], proxStr[12],
          latStr[16], lonStr[16], speedStr[12];

      // NaN Protection for all floats
      if (telemetry.status.temp_nc || isnan(telemetry.status.engineTemperature))
        strncpy(tempStr, "null", sizeof(tempStr));
      else
        snprintf(tempStr, sizeof(tempStr), "%.1f",
                 telemetry.status.engineTemperature);

      if (telemetry.status.oil_nc || isnan(telemetry.status.oilPressure))
        strncpy(oilStr, "null", sizeof(oilStr));
      else
        snprintf(oilStr, sizeof(oilStr), "%.2f", telemetry.status.oilPressure);

      if (telemetry.status.fuel_nc || isnan(telemetry.status.fuelLevel)) {
        strncpy(fuelStr, "null", sizeof(fuelStr));
        strncpy(fuelPctStr, "null", sizeof(fuelPctStr));
      } else {
        snprintf(fuelStr, sizeof(fuelStr), "%.1f", telemetry.status.fuelLevel);
        snprintf(fuelPctStr, sizeof(fuelPctStr), "%.1f",
                 (telemetry.status.fuelLevel / 52.0f) * 100.0f); // 52L capacity
      }

      if (telemetry.status.proximityDistance_cm < 0 ||
          isnan(telemetry.status.proximityDistance_cm))
        strncpy(proxStr, "null", sizeof(proxStr));
      else
        snprintf(proxStr, sizeof(proxStr), "%.1f",
                 telemetry.status.proximityDistance_cm);

      if (isnan(telemetry.gps.latitude) || telemetry.gps.latitude == 0.0f)
        strncpy(latStr, "0.000000", sizeof(latStr));
      else
        snprintf(latStr, sizeof(latStr), "%.6f", telemetry.gps.latitude);

      if (isnan(telemetry.gps.longitude) || telemetry.gps.longitude == 0.0f)
        strncpy(lonStr, "0.000000", sizeof(lonStr));
      else
        snprintf(lonStr, sizeof(lonStr), "%.6f", telemetry.gps.longitude);

      if (isnan(telemetry.gps.speed))
        strncpy(speedStr, "0.0", sizeof(speedStr));
      else
        snprintf(speedStr, sizeof(speedStr), "%.1f", telemetry.gps.speed);

      snprintf(
          payload, sizeof(payload),
          "{\"deviceId\":\"%s\","
          "\"temp\":%s,\"oil_pressure\":%s,\"fuel_liters\":%s,\"fuel_percent\":"
          "%s,"
          "\"rpm\":%d,\"gear\":%d,"
          "\"fuel_res\":%.1f,\"temp_res\":%.1f,"
          "\"engine_hours\":%.4f,\"engine_on\":%s,"
          "\"lat\":%s,\"lon\":%s,\"speed\":%s,\"sats\":%d,\"pos_mode\":"
          "\"%s\","
          "\"proximity_cm\":%s,\"temp_nc\":%s,\"fuel_nc\":%s,\"oil_nc\":%s}",
          DEVICE_ID, tempStr, oilStr, fuelStr, fuelPctStr, telemetry.status.rpm,
          telemetry.status.gear, telemetry.status.fuelResistance,
          telemetry.status.tempResistance,
          telemetry.status.engineHours / 3600.0f,
          telemetry.status.engineRunning ? "true" : "false", latStr, lonStr,
          speedStr, telemetry.gps.satellites, telemetry.gps.pos_mode, proxStr,
          telemetry.status.temp_nc ? "true" : "false",
          telemetry.status.fuel_nc ? "true" : "false",
          telemetry.status.oil_nc ? "true" : "false");
// Send to broker with retry mechanism
#if DEBUG_TELEMETRY
      Serial.println("[TELEMETRY] Sending new telemetry data...");
#endif
      bool success = false;

      if (xSemaphoreTake(modemMutex, pdMS_TO_TICKS(5000))) {
        success = gsmModem->sendData(MQTT_TOPIC_TELEMETRY, payload);
        // FALLBACK: If MQTT fails, try direct HTTP POST to backend
        if (!success) {
          if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(100))) {
            Serial.println(
                "[TELEMETRY] MQTT failed, trying direct HTTP POST...");
            xSemaphoreGive(serialMutex);
          }
          success = ((Infrastructure::SIM808Service *)gsmModem)
                        ->sendTelemetryHTTP(payload);
        }
        xSemaphoreGive(modemMutex);
      } else {
        if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(100))) {
          Serial.println("[TELEMETRY] Could not take mutex for send");
          xSemaphoreGive(serialMutex);
        }
      }
      if (success) {
        successCount++;
#if DEBUG_TELEMETRY
        Serial.print("[TELEMETRY] ✓ Data sent successfully! (Total: ");
        Serial.print(successCount);
        Serial.print(" | Failed: ");
        Serial.print(failCount);
        Serial.println(")");
#endif
      } else {
#if DEBUG_TELEMETRY
        Serial.println(
            "[TELEMETRY] ✗ Initial send failed, queuing for retry...");
#endif
        // Create failed telemetry item
        TelemetryQueueItem failedItem;
        failedItem.data = telemetry;
        // Safe copy with guaranteed null termination
        memset(failedItem.payload, 0, sizeof(failedItem.payload));
        strncpy(failedItem.payload, payload, sizeof(failedItem.payload) - 1);
        failedItem.retryCount = 0;
        // Queue for retry
        if (xQueueSend(failedTelemetryQueue, &failedItem, 0) != pdTRUE) {
          Serial.println("[TELEMETRY] Queue full, dropping failed message!");
        } else {
#if DEBUG_TELEMETRY
          Serial.println("[TELEMETRY] Message queued for retry");
#endif
        }
      }
    }
    // --- PROXIMITY BROADCAST (ESP-NOW) ---
    unsigned long now = millis();
    if (now - lastProximityBroadcast >= PROXIMITY_BROADCAST_MS) {
      struct_proximity msg;
      memset(&msg, 0, sizeof(msg));
      strncpy(msg.truckID, DEVICE_ID, sizeof(msg.truckID));
      msg.speed = (isnan(lastGPSPosition.speed) || isinf(lastGPSPosition.speed))
                      ? 0.0f
                      : lastGPSPosition.speed;
      msg.status = telemetry.status.engineRunning ? 1 : 0;
      // Broadcast to all (FF:FF:FF:FF:FF:FF)
      uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
      esp_now_send(broadcastAddress, (uint8_t *)&msg, sizeof(msg));
      lastProximityBroadcast = now;
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}
// ========== TASK 4: WEB SERVER (REMOVED) ==========
/*
void Task_WebServer(void* parameter) {
    // webService->initialize();

    while (1) {
        // webService->handleClient();
        vTaskDelay(pdMS_TO_TICKS(5)); // Yield for other tasks
    }
}
*/
// ========== FUEL SENSOR CALIBRATION ROUTINE ==========
// ========== FUEL SENSOR CALIBRATION ROUTINE ==========
void performFuelSensorCalibration() {
  Serial.println("");
  Serial.println("╔════════════════════════════════════════╗");
  Serial.println("║   FUEL SENSOR CALIBRATION MODE         ║");
  Serial.println("║   This runs only on first boot         ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.println("");
  // Initialize minimal hardware for calibration
  Infrastructure::ADS1115Adapter *adsCalibration =
      new Infrastructure::ADS1115Adapter();
  if (!adsCalibration->initialize()) {
    Serial.println("[ERROR] ADS1115 initialization failed! Cannot calibrate.");
    Serial.println("[WARN] Using default calibration values.");
    delete adsCalibration;
    return;
  }
  Infrastructure::FuelLevelSensor *fuelCalibration =
      new Infrastructure::FuelLevelSensor(adsCalibration);

  Serial.println("");
  Serial.println("========================================");
  Serial.println("STEP 1: MAXIMUM FUEL LEVEL (FULL TANK)");
  Serial.println("========================================");
  Serial.println(">>> Set the fuel sensor to MAXIMUM position (full tank)");
  Serial.println(">>> Wait for the sensor to stabilize...");
  Serial.println(">>> Calibration will start in 10 seconds");
  Serial.println("");
  // Countdown
  for (int i = 10; i > 0; i--) {
    Serial.print("Starting in ");
    Serial.print(i);
    Serial.println(" seconds...");
    delay(1000);
  }
  // Read maximum (full tank) resistance
  Serial.println("");
  Serial.println("Reading FULL tank resistance...");
  delay(500);
  float rFull = fuelCalibration->readRawResistance();
  Serial.print(">>> FULL tank resistance: ");
  Serial.print(rFull);
  Serial.println(" Ω");
  Serial.println("");
  Serial.println("========================================");
  Serial.println("STEP 2: MINIMUM FUEL LEVEL (EMPTY TANK)");
  Serial.println("========================================");
  Serial.println(">>> Set the fuel sensor to MINIMUM position (empty tank)");
  Serial.println(">>> Wait for the sensor to stabilize...");
  Serial.println(">>> Calibration will continue in 10 seconds");
  Serial.println("");
  // Countdown
  for (int i = 10; i > 0; i--) {
    Serial.print("Starting in ");
    Serial.print(i);
    Serial.println(" seconds...");
    delay(1000);
  }
  // Read minimum (empty tank) resistance
  Serial.println("");
  Serial.println("Reading EMPTY tank resistance...");
  delay(500);
  float rEmpty = fuelCalibration->readRawResistance();
  Serial.print(">>> EMPTY tank resistance: ");
  Serial.print(rEmpty);
  Serial.println(" Ω");
  Serial.println("");
  Serial.println("========================================");
  Serial.println("STEP 3: MIDDLE FUEL LEVEL (HALF TANK)");
  Serial.println("========================================");
  Serial.println(
      ">>> Set the fuel sensor to MIDDLE position (24cm / half tank)");
  Serial.println(">>> Wait for the sensor to stabilize...");
  Serial.println(">>> Calibration will continue in 10 seconds");
  Serial.println("");
  // Countdown
  for (int i = 10; i > 0; i--) {
    Serial.print("Starting in ");
    Serial.print(i);
    Serial.println(" seconds...");
    delay(1000);
  }
  // Read middle (half tank) resistance
  Serial.println("");
  Serial.println("Reading MIDDLE (half tank) resistance...");
  delay(500);
  float rMiddle = fuelCalibration->readRawResistance();
  Serial.print(">>> MIDDLE tank resistance: ");
  Serial.print(rMiddle);
  Serial.println(" Ω");
  // Save calibration data
  Serial.println("");
  Serial.println("========================================");
  Serial.println("CALIBRATION COMPLETE!");
  Serial.println("========================================");
  Serial.print("Empty tank (0%):   ");
  Serial.print(rEmpty);
  Serial.println(" Ω");
  Serial.print("Middle tank (50%): ");
  Serial.print(rMiddle);
  Serial.println(" Ω");
  Serial.print("Full tank (100%):  ");
  Serial.print(rFull);
  Serial.println(" Ω");
  Serial.println("");
  // Save to NVS
  Infrastructure::NVSStorage::CalibrationData data;
  data.fuel_r_empty = rEmpty;
  data.fuel_r_middle = rMiddle;
  data.fuel_r_full = rFull;
  data.fuel_tank_capacity = FUEL_TANK_CAPACITY;
  data.temp_beta = NTC_BETA;
  data.temp_r0 = NTC_R0;
  data.temp_offset = 0.0f;
  bool saved = storage->saveCalibration(data);
  if (saved) {
    Serial.println("✓ Calibration data saved to NVS");
    storage->setCalibrated(true);
  } else {
    Serial.println("[ERROR] Failed to save calibration data!");
  }
  if (!saved) {
    Serial.println("");
    Serial.println("[ERROR] Calibration did not persist. Please check NVS "
                   "(flash) or retry calibration manually.");

    // Cleanup
    delete fuelCalibration;
    delete adsCalibration;
    return;
  }
  Serial.println("");
  Serial.println(">>> Rebooting ESP32 in 3 seconds...");
  delay(3000);
  // Cleanup
  delete fuelCalibration;
  delete adsCalibration;
  // Reboot
  ESP.restart();
}
// ========== MQTT COMMAND CALLBACK ==========
void mqttCallback(char *topic, uint8_t *payload, unsigned int length) {
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  Serial.print("[MQTT] Message received on ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(message);

  // Parse JSON command
  DynamicJsonDocument doc(512);
  DeserializationError error = deserializeJson(doc, message);

  const char *command = nullptr;

  if (!error) {
    if (doc.is<JsonObject>()) {
      command = doc["command"];
    } else if (doc.is<const char *>()) {
      // Message is a string! Attempt to parse its internal content as JSON.
      // This happens with double-stringification from some backends.
      const char *innerJson = doc.as<const char *>();
      Serial.print("[MQTT] Wrapped JSON detected, re-parsing: ");
      Serial.println(innerJson);

      DynamicJsonDocument innerDoc(512);
      if (deserializeJson(innerDoc, innerJson) == DeserializationError::Ok) {
        command = innerDoc["command"];
        // We must copy the state if it exists
        if (!innerDoc["state"].isNull()) {
          // If we need the state later, we'll need to store it
          // For now, we'll let the existing logic handle 'doc' later?
          // No, we should replace 'doc' or extract what we need.
          doc = innerDoc;
        }
      } else {
        command = innerJson; // Fallback to raw string
      }
    }
  } else {
    // Fallback: treat raw message as command if JSON parsing fails
    command = message;
  }

  // Safety check: if command is still null, abort
  if (!command) {
    Serial.println("[MQTT] [X] Command is NULL, ignoring message");
    return;
  }

  if (strcmp(command, "UPDATE_CALIB") == 0) {
    Serial.println("[IS-CMD] Update Calibration received!");

    // Fetch new calibration from backend immediately
    if (gsmModem->isConnected()) {
      // Option A: Payload contains settings (Faster)
      if (doc.is<JsonObject>() && !doc["settings"].isNull()) {
        JsonObject settings = doc["settings"];
        Infrastructure::NVSStorage::CalibrationData data;

        data.fuel_r_empty = settings["fuelEmpty"] | 12.0f;
        data.fuel_r_middle =
            (data.fuel_r_empty + (float)(settings["fuelFull"] | 166.0f)) / 2.0f;
        data.fuel_r_full = settings["fuelFull"] | 166.0f;
        data.fuel_tank_capacity = settings["fuelTank"] | 60.0f;
        data.temp_beta = settings["tempBeta"] | 3950.0f;
        data.temp_r0 = settings["tempR0"] | 3025.0f;
        data.temp_offset = settings["tempOffset"] | 0.0f;
        if (storage->saveCalibration(data)) {
          Serial.println("[CALIB] New calibration saved via MQTT!");
          // Apply immediately
          fuelSensor->setCalibration(data.fuel_r_empty, data.fuel_r_middle,
                                     data.fuel_r_full);
          fuelSensor->setTankCapacity(
              data.fuel_tank_capacity); // Apply new capacity immediately
          tempSensor->setCalibration(data.temp_beta, data.temp_r0,
                                     data.temp_offset);
        }
      } else {
        // Option B: Trigger fetch (Slower but reliable sync)
        Serial.println("[CALIB] Triggering remote fetch...");
      }
    }
  } else if (strcmp(command, "RESET_HOURS") == 0) {
    Serial.println("[IS-CMD] Reset Engine Hours received!");
    engineHoursCalc->resetHours();
    Serial.println("[IS-CMD] Engine hours reset to 0");
  } else if (strcmp(command, "TRIGGER_ALARM") == 0) {
    // Handle TRIGGER_ALARM even if state is missing
    const char *state = "off";
    if (doc.is<JsonObject>() && !doc["state"].isNull()) {
      state = doc["state"];
    } else if (doc.is<const char *>()) {
      // If it was just the string "TRIGGER_ALARM", assume "on"
      state = "on";
    }

    if (state && strcmp(state, "on") == 0) {
      digitalWrite(GEOFENCE_ALARM_PIN, HIGH);
      Serial.println("[IS-CMD] Alarm TRIGGERED (ON)");
    } else {
      digitalWrite(GEOFENCE_ALARM_PIN, LOW);
      Serial.println("[IS-CMD] Alarm STOPPED (OFF)");
    }
  } else {
    Serial.print("[MQTT] Unknown command: ");
    Serial.println(command);
  }
}
// ========== DEPENDENCY INJECTION SETUP ==========
void setupDependencyInjection() {
  Serial.println("[INIT] Setting up Dependency Injection...");
  Serial.println("[INIT] All hardware configurations loaded from BSP.h");
  // Infrastructure Layer
  // Note: storage is already initialized in setup() for calibration check
  adsAdapter = new Infrastructure::ADS1115Adapter();
  if (!adsAdapter->initialize()) {
    Serial.println("[ERROR] ADS1115 initialization failed!");
  } else {
    Serial.println("✓ ADS1115 initialized");
  }
  // NTC Temperature Sensor now uses ADS1115 Channel 3 for better accuracy
  tempSensor = new Infrastructure::NTCTemperatureSensor(adsAdapter);
  oilSensor = new Infrastructure::OilPressureSensor(adsAdapter);
  fuelSensor = new Infrastructure::FuelLevelSensor(adsAdapter);
  rpmSensor = new Infrastructure::RPMSensor();
  gsmModem = new Infrastructure::SIM808Service();
  if (!gsmModem->initialize()) {
    Serial.println("[ERROR] SIM808 initialization failed!");
  } else {
    Serial.println("✓ SIM808 initialized");
  }

  // Register MQTT Callback
  gsmModem->setCallback(mqttCallback);
  if (!gsmModem->enableGPS()) {
    Serial.println("[ERROR] GPS initialization failed!");
  } else {
    Serial.println("✓ GPS enabled");
  }
  // Business Layer
  engineHoursCalc = new Business::EngineHoursCalculator(storage);
  engineHoursCalc->initialize();
  alertManager = new Business::AlertManager(gsmModem, MQTT_TOPIC_ALERTS);
  engineMonitor =
      new Business::EngineMonitor(tempSensor, oilSensor, fuelSensor, rpmSensor,
                                  alertManager, engineHoursCalc);
  fuelTheftDetector = new Business::FuelTheftDetector(alertManager, storage);
  fuelTheftDetector->initialize();
  fuelTheftDetector->updateFuelLevel(
      0, 0); // Reset baseline to 0 on start to avoid theft alert on boot
  // --- JSN-SR04T Proximity Sensor (Rear Obstacle Detection) ---
  proximitySensor = new Infrastructure::JSNSR04TSensor(PROXIMITY_TRIG_PIN,
                                                       PROXIMITY_ECHO_PIN);
  proximityMonitor =
      new Business::ProximityMonitor(proximitySensor, alertManager);
  Serial.print("✓ JSN-SR04T proximity sensor initialized (TRIG=GPIO");
  Serial.print(PROXIMITY_TRIG_PIN);
  Serial.print(", ECHO=GPIO");
  Serial.print(PROXIMITY_ECHO_PIN);
  Serial.print(", ALERT=");
  Serial.print(PROXIMITY_ALERT_CM, 0);
  Serial.println("cm)");
  // Load calibration data if available
  Infrastructure::NVSStorage::CalibrationData data;
  if (storage->loadCalibration(data)) {
    fuelSensor->setCalibration(data.fuel_r_empty, data.fuel_r_middle,
                               data.fuel_r_full);
    tempSensor->setCalibration(data.temp_beta, data.temp_r0, data.temp_offset);
    Serial.println("✓ Loaded calibration data from NVS");
  } else {
    Serial.println("[WARN] No calibration data found, using defaults");
  }
  // webService = new Infrastructure::WebService(engineMonitor); // DISABLED
  Serial.println("[INIT] Dependency Injection complete!");
}
// ========== ARDUINO SETUP ==========
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(1000);
  Serial.println("========================================");
  Serial.println("  Truck Telemetry System - Starting");
  Serial.println("  Clean Architecture + FreeRTOS");
  Serial.println("========================================");
  // --- AUTO-GENERATE DEVICE ID (no WiFi required - reads chip eFuse) ---
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac); // Reads hardware MAC without activating WiFi
  snprintf(DEVICE_ID, sizeof(DEVICE_ID), "truck_%02X%02X", mac[4],
           mac[5]); // e.g. truck_A3F2, unique per chip
  Serial.println("----------------------------------------");
  Serial.print("[DEVICE] Device ID : ");
  Serial.println(DEVICE_ID);
  Serial.println("  --> Use this ID in the admin dashboard");
  Serial.println("----------------------------------------");
  // Configure watchdog timer for longer timeout (prevents false triggers during
  // GPS operations) Increase watchdog timeout to 10 seconds (default is 5s)
  esp_err_t wdt_result = esp_task_wdt_init(10, true);
  if (wdt_result == ESP_OK) {
    Serial.println("[INIT] Watchdog timeout extended to 10 seconds");
  } else {
    Serial.print("[WARN] Watchdog init failed: ");
    Serial.println(wdt_result);
  }
  // Unsubscribe the Arduino loop task from watchdog (we don't use loop() - all
  // logic in FreeRTOS tasks)
  disableLoopWDT();
  Serial.println("[INIT] Loop task unsubscribed from watchdog");
  // Initialize storage first for calibration check
  storage = new Infrastructure::NVSStorage("truck");
  if (!storage->initialize()) {
    Serial.println("[ERROR] ✗ NVS Storage initialization failed!");
    Serial.println("[WARN] ⚠ System will continue with default values");
  }
  // Check if calibration is needed
  if (!storage->isCalibrated()) {
    Serial.println("[INFO] ℹ System not calibrated. Starting calibration...");
    performFuelSensorCalibration();
    // Will reboot after calibration, so code below won't execute
  } else {
    Serial.println("✓ System already calibrated");
  }

  // Setup Dependency Injection (Initializes I2C, Sensors, Modem)
  pinMode(GEOFENCE_ALARM_PIN, OUTPUT);
  digitalWrite(GEOFENCE_ALARM_PIN, LOW); // Ensure off initially
  setupDependencyInjection();
  // --- INITIALIZE ESP-NOW FOR BRACELET PROXIMITY ---
  WiFi.mode(WIFI_STA);
  if (esp_now_init() == ESP_OK) {
    Serial.println("[INIT] ESP-NOW Initialized for Proximity");

    // Add broadcast peer
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    memcpy(peerInfo.peer_addr, broadcastAddress, 6);
    peerInfo.channel = ESP_NOW_CHANNEL;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
      Serial.println("[ERROR] ✗ Failed to add ESP-NOW broadcast peer");
    }
  } else {
    Serial.println("[ERROR] ✗ ESP-NOW Init failed");
  }
  // Try to fetch remote calibration if GPRS is connected
  if (gsmModem->isConnected()) {
    Serial.println("[CALIB] Attempting to fetch remote calibration...");
    String json = gsmModem->fetchCalibration(DEVICE_ID);
    if (json.length() > 0) {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, json);
      if (!error && !doc["settings"].isNull()) {
        JsonObject settings = doc["settings"];

        Infrastructure::NVSStorage::CalibrationData data;
        data.fuel_r_empty = settings["fuelEmpty"] | 12.0f;
        data.fuel_r_middle =
            (data.fuel_r_empty + (settings["fuelFull"] | 166.0f)) / 2.0f;
        data.fuel_r_full = settings["fuelFull"] | 166.0f;
        data.fuel_tank_capacity = settings["fuelTank"] | 60.0f;
        data.temp_beta = settings["tempBeta"] | 3950.0f;
        data.temp_r0 = settings["tempR0"] | 3025.0f;
        data.temp_offset = settings["tempOffset"] | 0.0f;
        if (storage->saveCalibration(data)) {
          Serial.println("[CALIB] Remote calibration saved to NVS");
          // Apply immediately to sensors
          fuelSensor->setCalibration(data.fuel_r_empty, data.fuel_r_middle,
                                     data.fuel_r_full);
          tempSensor->setCalibration(data.temp_beta, data.temp_r0,
                                     data.temp_offset);
        }
      }
    }
  }
  // Create FreeRTOS Queues
  sensorDataQueue = xQueueCreate(QUEUE_SENSOR_DATA_SIZE, sizeof(SensorData));
  telemetryDataQueue =
      xQueueCreate(QUEUE_TELEMETRY_DATA_SIZE, sizeof(TelemetryData));
  failedTelemetryQueue =
      xQueueCreate(TELEMETRY_QUEUE_MAX_SIZE, sizeof(TelemetryQueueItem));
  modemMutex = xSemaphoreCreateMutex();
  serialMutex = xSemaphoreCreateMutex();
  serialMutex = xSemaphoreCreateMutex();
  if (sensorDataQueue == NULL || telemetryDataQueue == NULL ||
      failedTelemetryQueue == NULL) {
    Serial.println("[ERROR] ✗ Failed to create queues!");
    while (1)
      ;
  }
  Serial.print("✓ Telemetry retry queue created (max ");
  Serial.print(TELEMETRY_QUEUE_MAX_SIZE);
  Serial.println(" messages)");
  // Setup LED
  pinMode(OIL_PRESSURE_OK_LED_PIN, OUTPUT);
  digitalWrite(OIL_PRESSURE_OK_LED_PIN, LOW); // Start OFF
  // Setup Transmission Pins
  // Force PULLUP by writing HIGH after mode set (Safety measure)
  pinMode(PIN_TRANSMISSION_FWD, INPUT_PULLUP);
  digitalWrite(PIN_TRANSMISSION_FWD, HIGH);

  pinMode(PIN_TRANSMISSION_REV, INPUT_PULLUP);
  digitalWrite(PIN_TRANSMISSION_REV, HIGH);

  Serial.println(
      "[INIT] GPIO 26/27 Configured as INPUT_PULLUP + HIGH (Neutral State)");
  // Create FreeRTOS Tasks
  xTaskCreatePinnedToCore(
      Task_Acquisition, "SensorAcquisition", TASK_ACQUISITION_STACK_SIZE, NULL,
      TASK_ACQUISITION_PRIORITY, NULL, TASK_ACQUISITION_CORE);
  xTaskCreatePinnedToCore(Task_Logic, "BusinessLogic", TASK_LOGIC_STACK_SIZE,
                          NULL, TASK_LOGIC_PRIORITY, NULL, TASK_LOGIC_CORE);
  xTaskCreatePinnedToCore(Task_Telemetry, "Telemetry",
                          TASK_TELEMETRY_STACK_SIZE, NULL,
                          TASK_TELEMETRY_PRIORITY, NULL, TASK_TELEMETRY_CORE);
  Serial.println("[INIT] FreeRTOS tasks created successfully!");
  Serial.println("========================================");
}
// ========== ARDUINO LOOP (Not used - FreeRTOS manages execution) ==========
void loop() {
  // Empty - all logic handled by FreeRTOS tasks
  vTaskDelay(portMAX_DELAY);
}