#ifndef OIL_PRESSURE_H
#define OIL_PRESSURE_H

namespace Domain {

class OilPressure {
private:
    float bar;

public:
    explicit OilPressure(float b = 0.0f) : bar(b) {}

    float getBar() const { return bar; }
    float getPSI() const { return bar * 14.5038f; }

    bool isAboveThreshold(float threshold) const {
        return bar > threshold;
    }

    bool isCriticalForRPM(int rpm) const {
        // Diesel Engine Protection Curve
        // At idle (500-800 RPM): minimum 0.5 bar
        // At 1000 RPM: minimum 0.8 bar
        // At 1500 RPM: minimum 1.2 bar
        // At 2000+ RPM: minimum 1.5 bar

        float minPressure = 0.5f;

        if (rpm >= 2000) {
            minPressure = 1.5f;
        } else if (rpm >= 1500) {
            minPressure = 1.2f;
        } else if (rpm >= 1000) {
            minPressure = 0.8f;
        } else if (rpm >= 500) {
            minPressure = 0.5f;
        }

        return bar < minPressure;
    }
};

} // namespace Domain

#endif
