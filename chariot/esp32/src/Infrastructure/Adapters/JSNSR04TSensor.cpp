/**
 * @file JSNSR04TSensor.cpp
 * @brief Infrastructure Adapter — JSN-SR04T Waterproof Ultrasonic Sensor
 *
 * Algorithm:
 *  1. Send 10µs HIGH pulse on TRIG
 *  2. Measure ECHO pulse duration with pulseIn() + timeout
 *  3. Convert duration → distance: cm = (duration_µs * 0.0343) / 2
 *  4. Apply median filter (PROXIMITY_FILTER_SAMPLES) to remove spurious spikes
 *  5. Validate range [PROXIMITY_MIN_RANGE_CM, PROXIMITY_MAX_RANGE_CM]
 *
 * Returns -1.0f if:
 *  - pulseIn() times out (no obstacle in range, or sensor disconnected)
 *  - Computed distaance is outside valid range
 */

#include "JSNSR04TSensor.h"

namespace Infrastructure {

// ─────────────────────────────────────────────────────────────────────────────
// Constructor
// ─────────────────────────────────────────────────────────────────────────────
JSNSR04TSensor::JSNSR04TSensor(uint8_t trig, uint8_t echo)
    : trigPin(trig), echoPin(echo), filterIndex(0), filterFull(false)
{
    // Initialize filter buffer
    for (uint8_t i = 0; i < PROXIMITY_FILTER_SAMPLES; i++) {
        filterBuffer[i] = -1.0f;
    }

    // Configure GPIO pins
    pinMode(trigPin, OUTPUT);
    pinMode(echoPin, INPUT);
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2); // Ensure TRIG starts LOW
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: readDistance()
// ─────────────────────────────────────────────────────────────────────────────
float JSNSR04TSensor::readDistance() {
    float raw = measureOnce();
    return applyMedianFilter(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: measureOnce()
// Performs a single ultrasonic measurement.
// ─────────────────────────────────────────────────────────────────────────────
float JSNSR04TSensor::measureOnce() {
    // --- TRIGGER ---
    // Send a clean 10µs pulse
    digitalWrite(trigPin, LOW);
    delayMicroseconds(4);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // --- ECHO ---
    // Wait for echo pulse with timeout
    unsigned long duration = pulseIn(echoPin, HIGH, PROXIMITY_ECHO_TIMEOUT_US);

    // Timeout: no pulse received (no obstacle or sensor error)
    if (duration == 0) {
        #if DEBUG_PROXIMITY_SENSOR
        Serial.println("[PROXIMITY] Timeout - no obstacle in range");
        #endif
        return -1.0f;
    }

    // --- DISTANCE CALCULATION ---
    // Speed of sound ≈ 343 m/s = 0.0343 cm/µs
    // Round-trip: divide by 2
    float distanceCm = (duration * 0.0343f) / 2.0f;

    // --- RANGE VALIDATION ---
    if (distanceCm < PROXIMITY_MIN_RANGE_CM || distanceCm > PROXIMITY_MAX_RANGE_CM) {
        #if DEBUG_PROXIMITY_SENSOR
        Serial.print("[PROXIMITY] Out of range: ");
        Serial.print(distanceCm);
        Serial.println(" cm");
        #endif
        return -1.0f;
    }

    #if DEBUG_PROXIMITY_SENSOR
    Serial.print("[PROXIMITY] Raw: ");
    Serial.print(distanceCm, 1);
    Serial.println(" cm");
    #endif

    return distanceCm;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: applyMedianFilter()
// Accumulates readings and returns the median of the last N samples.
// Smooths out spurious echoes from vibration / EM noise.
// ─────────────────────────────────────────────────────────────────────────────
float JSNSR04TSensor::applyMedianFilter(float newReading) {
    // Store new reading in circular buffer
    filterBuffer[filterIndex] = newReading;
    filterIndex = (filterIndex + 1) % PROXIMITY_FILTER_SAMPLES;
    if (filterIndex == 0) filterFull = true;

    uint8_t count = filterFull ? PROXIMITY_FILTER_SAMPLES : filterIndex;
    if (count == 0) return newReading;

    // Copy to temp array for sorting (don't mutate circular buffer)
    float temp[PROXIMITY_FILTER_SAMPLES];
    for (uint8_t i = 0; i < count; i++) {
        temp[i] = filterBuffer[i];
    }

    return sortAndMedian(temp, count);
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: sortAndMedian()
// Bubble sort + median extraction. Treats -1.0f as "infinity" (no obstacle).
// ─────────────────────────────────────────────────────────────────────────────
float JSNSR04TSensor::sortAndMedian(float* arr, uint8_t size) {
    // Bubble sort (ascending)
    for (uint8_t i = 0; i < size - 1; i++) {
        for (uint8_t j = 0; j < size - 1 - i; j++) {
            // Treat -1 as "very large" (no obstacle)
            float a = (arr[j]   < 0) ? 99999.0f : arr[j];
            float b = (arr[j+1] < 0) ? 99999.0f : arr[j+1];
            if (a > b) {
                float tmp = arr[j];
                arr[j]   = arr[j+1];
                arr[j+1] = tmp;
            }
        }
    }

    // Return median
    return arr[size / 2];
}

} // namespace Infrastructure
