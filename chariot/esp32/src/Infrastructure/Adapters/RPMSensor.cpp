#include "RPMSensor.h"

namespace Infrastructure {

// Initialize static members
volatile unsigned long RPMSensor::lastPulseTime = 0;
volatile unsigned long RPMSensor::pulseInterval = 0;
volatile bool RPMSensor::pulseDetected = false;

RPMSensor::RPMSensor() {
#ifdef RPM_SENSOR_PIN
    pinMode(RPM_SENSOR_PIN, INPUT); // GPIO 35 requires external pullup for NPN sensors
    attachInterrupt(digitalPinToInterrupt(RPM_SENSOR_PIN), handleInterrupt, FALLING);
#endif
    lastPulseTime = 0;
    pulseInterval = 0;
    pulseDetected = false;
}

int RPMSensor::readRPM() {
    unsigned long now = micros();
    
    // Check for timeout (engine stop)
    if (lastPulseTime == 0 || (now - lastPulseTime > RPM_TIMEOUT_MS * 1000)) {
        return 0;
    }

    if (pulseInterval == 0) return 0;

    // RPM = (60,000,000 / pulseInterval) / pulses_per_rev
    unsigned long rpm = (60000000UL / pulseInterval) / RPM_PULSES_PER_REV;
    
    return (int)rpm;
}

void IRAM_ATTR RPMSensor::handleInterrupt() {
    unsigned long now = micros();
    unsigned long interval = now - lastPulseTime;
    
    // Debounce: ignore pulses faster than 10ms (corresponds to 6000 RPM at 1 pulse/rev)
    if (interval > 10000) { 
        pulseInterval = interval;
        lastPulseTime = now;
        pulseDetected = true;
    }
}

} // namespace Infrastructure
