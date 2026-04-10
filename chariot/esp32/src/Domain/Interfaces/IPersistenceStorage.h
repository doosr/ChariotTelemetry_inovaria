#ifndef I_PERSISTENCE_STORAGE_H
#define I_PERSISTENCE_STORAGE_H

namespace Domain {

class IPersistenceStorage {
public:
    virtual ~IPersistenceStorage() = default;

    virtual bool saveEngineHours(unsigned long hours) = 0;
    virtual unsigned long loadEngineHours() = 0;

    virtual bool saveFuelLevel(float liters) = 0;
    virtual float loadFuelLevel() = 0;
};

} // namespace Domain

#endif
