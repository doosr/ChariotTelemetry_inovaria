using UnityEngine;
using System;

[Serializable]
public class TelemetryData {
    public float temp;
    public float oil_pressure;
    public float fuel_percent;
    public int rpm;
    public int gear; // 1: AV, -1: AR, 0: N
    public float engine_hours;
    public bool engine_on;
}

public class ForkliftManager : MonoBehaviour {
    public Transform forks; // Drag forklift forks here
    public Transform[] wheels; // Drag all wheels here
    public Light engineIndicator;

    // This method is called by JavaScript
    public void UpdateTelemetry(string json) {
        try {
            TelemetryData data = JsonUtility.FromJson<TelemetryData>(json);
            
            // 1. Update Engine status
            if (engineIndicator != null) {
                engineIndicator.color = data.engine_on ? Color.green : Color.red;
            }

            // 2. Animate Forks based on fuel or load (example)
            if (forks != null) {
                float targetHeight = (data.fuel_percent / 100f) * 2.0f; 
                forks.localPosition = new Vector3(forks.localPosition.x, targetHeight, forks.localPosition.z);
            }

            // 3. Rotate wheels if RPM > 0
            if (data.rpm > 0) {
                foreach (var wheel in wheels) {
                    wheel.Rotate(Vector3.right * data.rpm * Time.deltaTime);
                }
            }

            Debug.Log("Unity: Telemetry Updated!");
        } catch (Exception e) {
            Debug.LogError("Error parsing telemetry: " + e.Message);
        }
    }
}
