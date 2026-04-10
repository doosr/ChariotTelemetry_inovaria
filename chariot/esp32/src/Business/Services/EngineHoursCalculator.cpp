#include "EngineHoursCalculator.h"
#include "../../BSP.h"
#include <Arduino.h>

namespace Business {

EngineHoursCalculator::EngineHoursCalculator(Domain::IPersistenceStorage *store)
    : storage(store), totalHours(0), lastUpdateTime(0), msAccumulator(0),
      engineWasRunning(false) {}

void EngineHoursCalculator::initialize() {
  unsigned long savedHours = storage->loadEngineHours();
  totalHours = Domain::EngineHours(savedHours);
}

bool EngineHoursCalculator::isEngineRunning(float oilPressure, int rpm) const {
  return (oilPressure > ENGINE_MIN_OIL_PRESSURE_BAR) || (rpm > ENGINE_MIN_RPM);
}

void EngineHoursCalculator::update(float oilPressure, int rpm,
                                   unsigned long currentTime) {
  bool engineRunning = isEngineRunning(oilPressure, rpm);

  if (engineRunning && engineWasRunning && lastUpdateTime > 0) {
    if (currentTime >= lastUpdateTime) {
      unsigned long deltaTime = currentTime - lastUpdateTime;

      // Sanity check: ignore deltas larger than 1 hour (3600000ms)
      if (deltaTime < 3600000) {
        msAccumulator += deltaTime;

        if (msAccumulator >= 1000) {
          unsigned long secondsToAdd = msAccumulator / 1000;
          totalHours.increment(secondsToAdd);
          msAccumulator %= 1000;
        }

#if DEBUG_CALIBRATION
        Serial.print("[HOURS] +");
        Serial.print(deltaTime);
        Serial.print("ms | Total: ");
        Serial.print(totalHours.getSeconds() / 3600.0f, 4);
        Serial.println(" h");
#endif
      }
    }
  }

  engineWasRunning = engineRunning;
  lastUpdateTime = currentTime;
}

Domain::EngineHours EngineHoursCalculator::getTotalHours() const {
  return totalHours;
}

void EngineHoursCalculator::saveToStorage() {
  storage->saveEngineHours(totalHours.getSeconds());
}

} // namespace Business
