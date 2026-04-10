#include "ADS1115Adapter.h"
#include <Wire.h>
namespace Infrastructure {
ADS1115Adapter::ADS1115Adapter() : initialized(false) {
    i2cMutex = xSemaphoreCreateMutex();
}
ADS1115Adapter::~ADS1115Adapter() {
    if (i2cMutex != NULL) {
        vSemaphoreDelete(i2cMutex);
    }
}
bool ADS1115Adapter::initialize() {
    // Initialize I2C with custom pins if needed
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
    Wire.setClock(I2C_FREQUENCY);
    if (!ads.begin(ADS1115_I2C_ADDRESS)) {
        return false;
    }
    // Set gain to measure up to 6.144V (needed for 5V sensors)
    ads.setGain(GAIN_TWOTHIRDS);
    initialized = true;
    return true;
}
int16_t ADS1115Adapter::readADC(uint8_t channel) {
    if (!initialized || i2cMutex == NULL) return 0;
    
    int16_t value = 0;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        value = ads.readADC_SingleEnded(channel);
        // Retry logic for I2C robustness (Error 263 / Bus glitches)
        for (int i = 0; i < 3; i++) {
            value = ads.readADC_SingleEnded(channel);
            
            // Basic error check: adafruit library doesn't give error codes easily here,
            // but if the read times out it might return 0 or -1 depending on state.
            // On ESP32, Wire library throws the [E] messages independently.
            // If the read succeeds, we don't see another Error 263 immediately.
            if (value != 0 && value != -1) break; 
            
            if (i < 2) delay(10); // Small wait between retries
        }
        xSemaphoreGive(i2cMutex);
    }
    return value;
}
float ADS1115Adapter::readVoltage(uint8_t channel) {
    if (!initialized) return 0.0f;
    int16_t adc = readADC(channel);
    // GAIN_TWOTHIRDS: 1 bit = 0.1875 mV
    return adc * 0.0001875f;
}
} // namespace Infrastructure
