#ifndef ENGINE_HOURS_H
#define ENGINE_HOURS_H

namespace Domain {

class EngineHours {
private:
    unsigned long totalSeconds;

public:
    explicit EngineHours(unsigned long seconds = 0) : totalSeconds(seconds) {}

    unsigned long getSeconds() const { return totalSeconds; }
    float getHours() const { return totalSeconds / 3600.0f; }

    void increment(unsigned long deltaSeconds) {
        totalSeconds += deltaSeconds;
    }

    bool operator>(const EngineHours& other) const {
        return totalSeconds > other.totalSeconds;
    }
};

} // namespace Domain

#endif
