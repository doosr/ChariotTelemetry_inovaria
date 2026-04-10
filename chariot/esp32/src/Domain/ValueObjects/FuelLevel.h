#ifndef FUEL_LEVEL_H
#define FUEL_LEVEL_H

namespace Domain {

class FuelLevel {
private:
    float liters;

public:
    explicit FuelLevel(float l = 0.0f) : liters(l) {}

    float getLiters() const { return liters; }

    float getPercentage(float tankCapacity) const {
        return (liters / tankCapacity) * 100.0f;
    }

    float deltaFrom(const FuelLevel& other) const {
        return liters - other.liters;
    }

    bool operator<(const FuelLevel& other) const {
        return liters < other.liters;
    }
};

} // namespace Domain

#endif
