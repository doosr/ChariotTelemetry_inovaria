#include "NTCTemperatureSensor.h"
#include "ADS1115Adapter.h"
#include <cmath>
namespace Infrastructure {
NTCTemperatureSensor::NTCTemperatureSensor(ADS1115Adapter *ads)
    : ads1115(ads), vcc(NTC_VCC), rFixed(NTC_R_FIXED), beta(NTC_BETA),
      r0(NTC_R0), t0(NTC_T0_KELVIN), offset(0.0f) {
  // No need to pinMode - ADS1115 handles the channel
}
void NTCTemperatureSensor::setCalibration(float betaValue, float r0Value,
                                          float offsetCelsius) {
  beta = betaValue;
  r0 = r0Value;
  offset = offsetCelsius;
}
float NTCTemperatureSensor::readTemperature() {
  // Read voltage from ADS1115 Channel 3
  float voltage = ads1115->readVoltage(ADS1115_CH_NTC_TEMPERATURE);
  // Explicit I2C failure: readVoltage returns -1.0f on bus error
  if (voltage < -0.5f) {
    #if DEBUG_NTC
    Serial.println("[TEMP] I2C Error (ADS1115 read failed)");
    #endif
    lastIsDisconnected = true;
    return NAN;
  }
  // Calculate resistance from voltage divider
  float resistance = calculateResistance(voltage);
  // Negative resistance = conversion error
  if (resistance < 0.0f) {
    #if DEBUG_NTC
    Serial.println("[TEMP] I2C/Conversion Error (Negative Resistance)");
    #endif
    lastIsDisconnected = true;
    return NAN;
  }
  // "disconnected" 500k+ is characteristic of an open/disconnected NTC
  if (resistance > 500000.0f) {
        #if DEBUG_NTC
        Serial.println("[TEMP] Sensor Disconnected (High Resistance)");
        #endif
        lastIsDisconnected = true;
        return NAN;
  }

    // Calculate temperature using Steinhart-Hart Beta equation
    float temperature = calculateTemperature(resistance) + offset;
    // Plausibility guard: valid engine temperature is within (0, 150] Celsius.
    // Floating/unconnected ADS channels produce garbage ADC values that can
    // pass all resistance checks but yield nonsensical temperatures.
    // Threshold is set to 0.0°C (conservative for Tunisia climate; adjust for
    // cold climates).
    if (temperature <= 0.0f || temperature > 150.0f) {
        #if DEBUG_NTC
        Serial.print("[TEMP] Out-of-range reading discarded: ");
        Serial.print(temperature, 1);
        Serial.println(" C");
        #endif
        lastIsDisconnected = true;
        return NAN;
    }
    lastIsDisconnected = false;
    #if DEBUG_TEMP_SENSOR
    Serial.print("[TEMP] V=");
    Serial.print(voltage, 3);
    Serial.print("V, R=");
    Serial.print(resistance, 1);
    Serial.print("Ω, T=");
    Serial.print(temperature, 1);
    Serial.println("°C");
    #endif
    return temperature;
  }
  float NTCTemperatureSensor::readRawResistance() {
    float voltage = ads1115->readVoltage(ADS1115_CH_NTC_TEMPERATURE);
    return calculateResistance(voltage);
  }
  float NTCTemperatureSensor::calculateResistance(float voltage) {
    if (voltage < 0.0f)
      return -1.0f; // I2C Fail

    // Circuit: 3.3V → NTC → (Vout/A3) → R_FIXED (1kΩ) → GND
    // NC Check: If voltage is near 0, the NTC is open.
    if (voltage < 0.05f)
      return 1000000.0f; // 1MΩ (Disconnected)

    // Short Check: If voltage is near VCC, the NTC is shorted.
    if (voltage >= vcc * 0.99f)
      return 0.0f;
    return rFixed * ((vcc - voltage) / voltage);
  }
  float NTCTemperatureSensor::calculateTemperature(float resistance) {
    if (resistance < 0.0f || resistance > 500000.0f)
      return 0.0f;
    // Steinhart-Hart Beta equation: 1/T = (1/Beta) * ln(R/R0) + (1/T0)
    float tempK =
        1.0f / ((1.0f / beta) * std::log(resistance / r0) + (1.0f / t0));
    return tempK - 273.15f; // Convert Kelvin to Celsius
  }
} // namespace Infrastructure