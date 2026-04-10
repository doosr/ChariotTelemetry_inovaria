#include "NVSStorage.h"
#include <Arduino.h>
#include "../../BSP.h"

namespace Infrastructure {

NVSStorage::NVSStorage(const char* ns) : namespaceName(ns), isInitialized(false) {}

bool NVSStorage::initialize() {
    // Initialize NVS flash
    esp_err_t err = nvs_flash_init();

    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated or needs to be erased
        Serial.println("[WARN] NVS partition needs to be erased. Erasing...");
        err = nvs_flash_erase();
        if (err != ESP_OK) {
            Serial.print("[ERROR] NVS erase failed: ");
            Serial.println(esp_err_to_name(err));
            return false;
        }

        // Retry initialization after erase
        err = nvs_flash_init();
    }

    if (err != ESP_OK) {
        Serial.print("[ERROR] NVS initialization failed: ");
        Serial.println(esp_err_to_name(err));
        return false;
    }

    Serial.println("✓ NVS initialized successfully");

    // Create the namespace if it doesn't exist by opening it once in write mode
    if (!preferences.begin(namespaceName, false)) {
        Serial.print("[ERROR] Failed to create/open NVS namespace: ");
        Serial.println(namespaceName);
        return false;
    }
    preferences.end();

    Serial.print("✓ NVS namespace '");
    Serial.print(namespaceName);
    Serial.println("' ready");

    isInitialized = true;
    return true;
}

bool NVSStorage::saveEngineHours(unsigned long hours) {
    if (!isInitialized) {
        Serial.println("[WARN] NVS not initialized, skipping save");
        return false;
    }

    if (!preferences.begin(namespaceName, false)) {
        Serial.println("[ERROR] Failed to open NVS namespace for writing");
        return false;
    }

    bool result = preferences.putULong("engineHours", hours);
    preferences.end();

    if (!result) {
        Serial.println("[ERROR] Failed to save engine hours to NVS");
    }

    return result;
}

unsigned long NVSStorage::loadEngineHours() {
    if (!isInitialized) {
        Serial.println("[WARN] NVS not initialized, returning default engine hours (0)");
        return 0;
    }

    if (!preferences.begin(namespaceName, true)) {
        Serial.println("[ERROR] Failed to open NVS namespace for reading");
        return 0;
    }

    unsigned long hours = preferences.getULong("engineHours", 0);
    preferences.end();
    return hours;
}

bool NVSStorage::saveFuelLevel(float liters) {
    if (!isInitialized) {
        Serial.println("[WARN] NVS not initialized, skipping save");
        return false;
    }

    if (!preferences.begin(namespaceName, false)) {
        Serial.println("[ERROR] Failed to open NVS namespace for writing");
        return false;
    }

    bool result = preferences.putFloat("fuelLevel", liters);
    preferences.end();

    if (!result) {
        Serial.println("[ERROR] Failed to save fuel level to NVS");
    }

    return result;
}

float NVSStorage::loadFuelLevel() {
    if (!isInitialized) {
        Serial.println("[WARN] NVS not initialized, returning default fuel level (0.0)");
        return 0.0f;
    }

    if (!preferences.begin(namespaceName, true)) {
        Serial.println("[ERROR] Failed to open NVS namespace for reading");
        return 0.0f;
    }

    float level = preferences.getFloat("fuelLevel", 0.0f);
    preferences.end();
    return level;
}

bool NVSStorage::saveCalibration(const CalibrationData& data) {
    if (!isInitialized) return false;
    if (!preferences.begin(namespaceName, false)) return false;

    preferences.putFloat("cal_f_empty", data.fuel_r_empty);
    preferences.putFloat("cal_f_mid", data.fuel_r_middle);
    preferences.putFloat("cal_f_full", data.fuel_r_full);
    preferences.putFloat("cal_f_cap", data.fuel_tank_capacity);
    preferences.putFloat("cal_t_beta", data.temp_beta);
    preferences.putFloat("cal_t_r0", data.temp_r0);
    preferences.putFloat("cal_t_off", data.temp_offset);
    
    preferences.end();
    return true;
}

bool NVSStorage::loadCalibration(CalibrationData& data) {
    if (!isInitialized) return false;
    if (!preferences.begin(namespaceName, true)) return false;

    data.fuel_r_empty = preferences.getFloat("cal_f_empty", FUEL_R_EMPTY);
    data.fuel_r_middle = preferences.getFloat("cal_f_mid", (FUEL_R_EMPTY + FUEL_R_FULL) / 2.0f);
    data.fuel_r_full = preferences.getFloat("cal_f_full", FUEL_R_FULL);
    data.fuel_tank_capacity = preferences.getFloat("cal_f_cap", FUEL_TANK_CAPACITY);
    data.temp_beta = preferences.getFloat("cal_t_beta", NTC_BETA);
    data.temp_r0 = preferences.getFloat("cal_t_r0", NTC_R0);
    data.temp_offset = preferences.getFloat("cal_t_off", 0.0f);

    preferences.end();
    return true;
}

bool NVSStorage::isCalibrated() {
    if (!isInitialized) {
        return false;
    }

    if (!preferences.begin(namespaceName, true)) {
        return false;
    }

    bool calibrated = preferences.getBool("calibrated", false);
    preferences.end();

    return calibrated;
}

bool NVSStorage::setCalibrated(bool calibrated) {
    if (!isInitialized) {
        return false;
    }

    if (!preferences.begin(namespaceName, false)) {
        return false;
    }

    bool result = preferences.putBool("calibrated", calibrated);
    preferences.end();

    return result;
}

} // namespace Infrastructure
