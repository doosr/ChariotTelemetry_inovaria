#ifndef JSN_SR04T_SENSOR_H
#define JSN_SR04T_SENSOR_H

/**
 * @file JSNSR04TSensor.h
 * @brief Infrastructure Adapter — JSN-SR04T Waterproof Ultrasonic Sensor
 *
 * Implements Domain::IProximitySensor.
 * Mounted at the REAR of the forklift to detect obstacles (pallets, walls, people).
 *
 * Wiring:
 *   TRIG → BSP.PROXIMITY_TRIG_PIN (GPIO 14)
 *   ECHO ← BSP.PROXIMITY_ECHO_PIN (GPIO 13) [via 2kΩ+1kΩ voltage divider]
 *   VCC  → 5V
 *   GND  → GND
 */

#include <Arduino.h>
#include "../../Domain/Interfaces/ISensorReader.h"
#include "../../BSP.h"

namespace Infrastructure {

class JSNSR04TSensor : public Domain::IProximitySensor {
private:
    uint8_t trigPin;
    uint8_t echoPin;
    
    // Internal filter buffer
    float filterBuffer[PROXIMITY_FILTER_SAMPLES];
    uint8_t filterIndex;
    bool filterFull;

    // Internal helpers
    float measureOnce();
    float applyMedianFilter(float newReading);
    float sortAndMedian(float* arr, uint8_t size);

public:
    /**
     * @brief Constructor — configures GPIO pins
     * @param trig Trigger output pin (default: PROXIMITY_TRIG_PIN)
     * @param echo Echo input pin  (default: PROXIMITY_ECHO_PIN)
     */
    JSNSR04TSensor(uint8_t trig = PROXIMITY_TRIG_PIN, uint8_t echo = PROXIMITY_ECHO_PIN);

    /**
     * @brief Read filtered distance from rear obstacle
     * @return Distance in cm (float), or -1.0f if no obstacle in range / timeout
     */
    float readDistance() override;
};

} // namespace Infrastructure

#endif // JSN_SR04T_SENSOR_H
