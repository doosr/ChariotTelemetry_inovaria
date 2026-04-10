#ifndef GPS_COORDINATES_H
#define GPS_COORDINATES_H

#include <cmath>

namespace Domain {

struct GPSCoordinates {
    float latitude;
    float longitude;
    float altitude;
    float speed;
    int satellites;
    float accuracy;
    const char* pos_mode; // "gps" (outdoor) or "gnss" (indoor)

    GPSCoordinates()
        : latitude(0.0f), longitude(0.0f), altitude(0.0f),
          speed(0.0f), satellites(0), accuracy(0.0f), pos_mode("gps") {}

    bool isValid() const {
        return (latitude != 0.0f || longitude != 0.0f) && satellites >= 3;
    }

    float distanceTo(const GPSCoordinates& other) const {
        // Haversine formula for distance calculation
        const float R = 6371000.0f; // Earth radius in meters
        float lat1 = latitude * 0.017453292f; // Convert to radians
        float lat2 = other.latitude * 0.017453292f;
        float dLat = (other.latitude - latitude) * 0.017453292f;
        float dLon = (other.longitude - longitude) * 0.017453292f;

        float a = std::sin(dLat/2) * std::sin(dLat/2) +
                  std::cos(lat1) * std::cos(lat2) *
                  std::sin(dLon/2) * std::sin(dLon/2);
        float c = 2 * std::atan2(std::sqrt(a), std::sqrt(1-a));

        return R * c;
    }
};

} // namespace Domain

#endif
