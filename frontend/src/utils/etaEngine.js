import { calculateDistanceMeters } from './snapToRoad.js';

/**
 * Calculates rolling 45-second moving average speed (km/h)
 */
export const calculateMovingAverageSpeed = (recentPoints) => {
    if (!recentPoints || recentPoints.length < 2) return 20; // Default 20 km/h baseline

    let totalDistMeters = 0;
    const nowMs = Date.now();
    const windowPoints = recentPoints.filter(p => (nowMs - p.timestampMs) <= 45000);

    if (windowPoints.length < 2) return 20;

    for (let i = 0; i < windowPoints.length - 1; i++) {
        totalDistMeters += calculateDistanceMeters(
            windowPoints[i].latitude,
            windowPoints[i].longitude,
            windowPoints[i + 1].latitude,
            windowPoints[i + 1].longitude
        );
    }

    const elapsedSeconds = (windowPoints[windowPoints.length - 1].timestampMs - windowPoints[0].timestampMs) / 1000;
    if (elapsedSeconds <= 0) return 20;

    const speedMs = totalDistMeters / elapsedSeconds;
    const speedKmh = speedMs * 3.6;

    return Math.max(2, Math.min(speedKmh, 60)); // Clamp between 2 and 60 km/h
};

/**
 * Calculates Dynamic ETA to target bus stop
 */
export const computeDynamicEta = (busLocation, targetStopLocation, movingSpeedKmh, historicalSlotSpeedKmh = 20) => {
    if (!busLocation || !targetStopLocation) {
        return { etaMinutes: null, statusText: 'Unknown', isStuckInTraffic: false };
    }

    const distanceMeters = calculateDistanceMeters(
        busLocation.latitude,
        busLocation.longitude,
        targetStopLocation.latitude,
        targetStopLocation.longitude
    );

    // Traffic Jam Detection: Speed < 3 km/h for > 30s
    if (movingSpeedKmh < 3 && distanceMeters > 50) {
        return {
            etaMinutes: Math.ceil((distanceMeters / (10 * 1000 / 3600)) / 60) + 5, // Estimate delay
            statusText: 'Stuck in Traffic – Delayed',
            isStuckInTraffic: true,
            distanceMeters
        };
    }

    // Hybrid Speed calculation (70% live speed + 30% 7-active-day time-slot baseline)
    const hybridSpeedKmh = 0.7 * movingSpeedKmh + 0.3 * historicalSlotSpeedKmh;
    const hybridSpeedMs = (hybridSpeedKmh * 1000) / 3600;

    const etaSeconds = distanceMeters / hybridSpeedMs;
    const etaMinutes = Math.max(1, Math.round(etaSeconds / 60));

    return {
        etaMinutes,
        statusText: etaMinutes <= 1 ? 'Arriving now' : `~${etaMinutes} mins`,
        isStuckInTraffic: false,
        distanceMeters
    };
};
