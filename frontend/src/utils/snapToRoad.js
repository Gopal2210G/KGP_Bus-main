/**
 * Distance in meters between two lat/lng points using Haversine formula
 */
export const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radius of Earth in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Gatekeeper: Rejects GPS readings with accuracy > 30 meters
 */
export const isValidGpsReading = (position, maxAccuracyMeters = 30) => {
    if (!position || !position.coords) return false;
    const accuracy = position.coords.accuracy;
    if (accuracy !== undefined && accuracy !== null && accuracy > maxAccuracyMeters) {
        console.warn(`⚠️ GPS Reading discarded due to low accuracy (${accuracy.toFixed(1)}m > ${maxAccuracyMeters}m threshold)`);
        return false;
    }
    return true;
};

/**
 * Distance-based throttling: Checks if user moved > minMeters or if minSeconds passed
 */
export const shouldBroadcastLocation = (lastLocation, newLocation, minMeters = 10, minSeconds = 30) => {
    if (!lastLocation) return true;

    const elapsedSeconds = (Date.now() - (lastLocation.timeMs || 0)) / 1000;
    if (elapsedSeconds >= minSeconds) return true;

    const dist = calculateDistanceMeters(
        lastLocation.latitude,
        lastLocation.longitude,
        newLocation.latitude,
        newLocation.longitude
    );

    return dist >= minMeters;
};

/**
 * Snap coordinate onto nearest point of route polyline road segments
 */
export const snapToRoutePolyline = (point, polylinePoints) => {
    if (!polylinePoints || polylinePoints.length < 2) return point;

    let closestPoint = point;
    let minDistance = Infinity;

    for (let i = 0; i < polylinePoints.length - 1; i++) {
        const segStart = polylinePoints[i];
        const segEnd = polylinePoints[i + 1];

        const projected = projectPointOnSegment(point, segStart, segEnd);
        const dist = calculateDistanceMeters(point[0], point[1], projected[0], projected[1]);

        if (dist < minDistance) {
            minDistance = dist;
            closestPoint = projected;
        }
    }

    // Only snap if closest segment is within 100m radius
    return minDistance < 100 ? closestPoint : point;
};

const projectPointOnSegment = (p, a, b) => {
    const l2 = Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2);
    if (l2 === 0) return a;

    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));

    return [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1])
    ];
};
