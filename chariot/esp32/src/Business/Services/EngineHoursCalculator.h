#ifndef ENGINE_HOURS_CALCULATOR_H
#define ENGINE_HOURS_CALCULATOR_H

#include "../../Domain/ValueObjects/EngineHours.h"
#include "../../Domain/Interfaces/IPersistenceStorage.h"
#include "../../BSP.h"

namespace Business {

class EngineHoursCalculator {
public:
    bool isEngineRunning(float oilPressure, int rpm) const;

private:
    Domain::IPersistenceStorage* storage;
    Domain::EngineHours totalHours;
    unsigned long lastUpdateTime;
    unsigned long msAccumulator;
    bool engineWasRunning;

public:
    explicit EngineHoursCalculator(Domain::IPersistenceStorage* store);

    void initialize();
    void update(float oilPressure, int rpm, unsigned long currentTime);
    Domain::EngineHours getTotalHours() const;
    void saveToStorage();

    // Reset functionality for remote commands
    void resetHours() {
        totalHours = Domain::EngineHours(0);
        saveToStorage();
    }

};

} // namespace Business
#endif // ENGINE_HOURS_CALCULATOR_H