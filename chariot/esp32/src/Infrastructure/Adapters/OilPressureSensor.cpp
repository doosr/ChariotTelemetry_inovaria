#include "OilPressureSensor.h"

namespace Infrastructure {

OilPressureSensor::OilPressureSensor(ADS1115Adapter* adsAdapter)
    : ads(adsAdapter) {}

float OilPressureSensor::readPressure() {
    float voltage = ads->readVoltage(ADS1115_CH_OIL_PRESSURE);
    
    // Check for open circuit (voltage near Vcc or very high resistance)
    // Only flag as disconnected if we are NOT in switch mode, 
    // because in switch mode 3.3V (VCC) is the "NORMAL" state (Pressure OK).
    if (!OIL_SENSOR_IS_SWITCH && voltage >= OIL_V_REF - 0.1f) {
        #if DEBUG_OIL_SENSOR
        Serial.println("[OIL] Sensor Disconnected (Open Circuit)");
        #endif
        lastIsDisconnected = true;
        return 0.0f; // Return 0 as requested by user
    }
    
    lastIsDisconnected = false;

    float resistance = calculateResistance(voltage);
    float pressure = resistanceToPressure(resistance);

    #if DEBUG_OIL_SENSOR
    Serial.print("[OIL] V=");
    Serial.print(voltage, 3);
    Serial.print("V, R=");
    Serial.print(resistance, 1);
    Serial.print("Ω, P=");
    Serial.print(pressure, 2);
    Serial.println(" Bar");
    #endif

    return pressure;
}

float OilPressureSensor::calculateResistance(float voltage) {
    // Voltage Divider: Vout = Vcc * (Rsensor / (Rsensor + Rpullup))
    // Rsensor = Rpullup * (Vout / (Vcc - Vout))
    
    if (voltage >= OIL_V_REF - 0.1f) return 9999.0f; // Open circuit
    if (voltage <= 0.1f) return 0.0f; // Short circuit

    return OIL_R_PULLUP * (voltage / (OIL_V_REF - voltage));
}

float OilPressureSensor::resistanceToPressure(float resistance) {
    #if OIL_SENSOR_IS_SWITCH
        // Switch Logic (C240 Manocontact)
        // 0.3 Ohms = Closed = Low Pressure
        // Infinite Ohms = Open = OK Pressure
        
        if (resistance < OIL_SWITCH_THRESHOLD_R) {
             // Contact Closed -> Ground -> Low Pressure
            return 0.0f;
        } else {
             // Contact Open -> High Resistance -> Pressure OK
            return OIL_SWITCH_PRESSURE_OK;
        }
    #else
        // Analog Sensor Logic (Standard Isuzu C240: 240-33 Ohms)
        // Check for open circuit (high resistance)
        if (resistance > 2000.0f) return 0.0f; // Sensor disconnected

        // Linear interpolation
        // Standard C240: 0 Bar = 240 Ohm, 7 Bar = 33 Ohm
        float ratio = (resistance - 240.0f) / (33.0f - 240.0f);
        
        // Clamp ratio 0.0 - 1.0
        if (ratio < 0.0f) ratio = 0.0f;
        
        float pressure = 0.0f + ratio * (7.0f - 0.0f);
        
        if (pressure < 0.0f) return 0.0f;
        return pressure;
    #endif
}

} // namespace Infrastructure
