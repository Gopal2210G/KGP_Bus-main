/**
 * Linear Interpolation (Lerp) helper
 */
export const lerp = (start, end, t) => {
    return start + (end - start) * Math.max(0, Math.min(1, t));
};

/**
 * Lerp between two LatLng points
 */
export const lerpLatLng = (startPoint, endPoint, t) => {
    return [
        lerp(startPoint[0], endPoint[0], t),
        lerp(startPoint[1], endPoint[1], t)
    ];
};

/**
 * 60 FPS Marker Smooth Gliding Animation
 * Animates a Leaflet marker from current position to new target position over durationMs
 */
export const animateMarkerSmoothly = (marker, newLatLng, durationMs = 2000) => {
    if (!marker) return;

    const startLatLng = marker.getLatLng();
    const start = [startLatLng.lat, startLatLng.lng];
    const end = [newLatLng.latitude || newLatLng[0], newLatLng.longitude || newLatLng[1]];

    // If position difference is negligible, snap directly
    const distSq = Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2);
    if (distSq < 0.00000001) {
        marker.setLatLng(end);
        return;
    }

    const startTime = performance.now();

    const frame = (now) => {
        const elapsed = now - startTime;
        const progress = elapsed / durationMs;

        if (progress < 1.0) {
            const currentPos = lerpLatLng(start, end, progress);
            marker.setLatLng(currentPos);
            requestAnimationFrame(frame);
        } else {
            marker.setLatLng(end);
        }
    };

    requestAnimationFrame(frame);
};

/**
 * Dead Reckoning Extrapolation
 * Predicts next position during low-network signal drop based on last known velocity and heading angle
 */
export const extrapolateDeadReckoning = (lastPos, speedKmh, headingDeg, elapsedSeconds) => {
    if (!lastPos || speedKmh <= 2) return lastPos; // Stationary

    const speedMs = (speedKmh * 1000) / 3600; // Convert km/h to m/s
    const distanceMeters = speedMs * Math.min(elapsedSeconds, 25); // Cap extrapolation at 25s max

    // Earth radius ~ 6,371,000 meters
    const R = 6371000;
    const latRad = (lastPos[0] * Math.PI) / 180;
    const lngRad = (lastPos[1] * Math.PI) / 180;
    const bearingRad = (headingDeg * Math.PI) / 180;

    const newLatRad = Math.asin(
        Math.sin(latRad) * Math.cos(distanceMeters / R) +
        Math.cos(latRad) * Math.sin(distanceMeters / R) * Math.cos(bearingRad)
    );

    const newLngRad = lngRad + Math.atan2(
        Math.sin(bearingRad) * Math.sin(distanceMeters / R) * Math.cos(latRad),
        Math.cos(distanceMeters / R) - Math.sin(latRad) * Math.sin(newLatRad)
    );

    return [
        (newLatRad * 180) / Math.PI,
        (newLngRad * 180) / Math.PI
    ];
};
