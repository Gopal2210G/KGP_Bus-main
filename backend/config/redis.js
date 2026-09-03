import Redis from 'ioredis';
import { pool } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let isRedisConnected = false;

// Fallback in-memory map store when Redis server is offline
const inMemoryCache = {
    buses: new Map(),
    users: new Map(),
    routes: new Map()
};

// Initialize ioredis
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

try {
    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
            if (times >= 1) {
                // Stop retrying quickly to avoid terminal noise
                return null;
            }
            return 500;
        },
        lazyConnect: true
    });

    redisClient.on('connect', () => {
        isRedisConnected = true;
        console.log('✅ Connected to Redis server at:', redisUrl);
    });

    redisClient.on('error', (err) => {
        if (isRedisConnected) {
            console.warn('⚠️ Redis connection interrupted:', err.message);
        }
        isRedisConnected = false;
    });

    // Attempt initial connection once
    redisClient.connect().catch((err) => {
        isRedisConnected = false;
        console.log(`ℹ️  External Redis at ${redisUrl.split('@').pop()} not reachable (Verify IP in Render Networking). Operating smoothly using built-in In-Memory store.`);
    });
} catch (e) {
    isRedisConnected = false;
    console.log('ℹ️ Operating smoothly using built-in In-Memory store.');
}

// ----------------------------------------------------
// Location Store Helper Methods (Redis with Fallback)
// ----------------------------------------------------

export const setLiveBusLocation = async (busId, data) => {
    const payload = {
        busId,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        speed: data.speed || 0,
        heading: data.heading || 0,
        timestamp: data.timestamp || new Date().toISOString()
    };

    if (isRedisConnected && redisClient) {
        try {
            await redisClient.hset(`bus_location:${busId}`, {
                latitude: payload.latitude,
                longitude: payload.longitude,
                speed: payload.speed,
                heading: payload.heading,
                timestamp: payload.timestamp
            });
        } catch (err) {
            inMemoryCache.buses.set(String(busId), payload);
        }
    } else {
        inMemoryCache.buses.set(String(busId), payload);
    }
    return payload;
};

export const getLiveBusLocation = async (busId) => {
    if (isRedisConnected && redisClient) {
        try {
            const res = await redisClient.hgetall(`bus_location:${busId}`);
            if (res && res.latitude) {
                return {
                    busId,
                    latitude: parseFloat(res.latitude),
                    longitude: parseFloat(res.longitude),
                    speed: parseFloat(res.speed || 0),
                    heading: parseFloat(res.heading || 0),
                    timestamp: res.timestamp
                };
            }
        } catch (err) {
            // Fallthrough to in-memory
        }
    }
    return inMemoryCache.buses.get(String(busId)) || null;
};

export const setLiveUserLocation = async (userId, data) => {
    const payload = {
        userId,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        timestamp: data.timestamp || new Date().toISOString()
    };

    if (isRedisConnected && redisClient) {
        try {
            await redisClient.hset(`user_location:${userId}`, {
                latitude: payload.latitude,
                longitude: payload.longitude,
                timestamp: payload.timestamp
            });
        } catch (err) {
            inMemoryCache.users.set(String(userId), payload);
        }
    } else {
        inMemoryCache.users.set(String(userId), payload);
    }
    return payload;
};

// Batch buffer for asynchronous database logging
const locationBatchQueue = {
    buses: [],
    users: []
};

export const queueLocationForBatchInsert = (type, data) => {
    if (type === 'bus') {
        locationBatchQueue.buses.push(data);
    } else {
        locationBatchQueue.users.push(data);
    }
};

// Background worker: Flush location queue to PostgreSQL every 30 seconds
setInterval(async () => {
    if (locationBatchQueue.buses.length > 0) {
        const batch = [...locationBatchQueue.buses];
        locationBatchQueue.buses = [];
        try {
            const values = [];
            const valueStrings = batch.map((item, idx) => {
                const base = idx * 3;
                values.push(item.busId, item.latitude, item.longitude);
                return `($${base + 1}, $${base + 2}, $${base + 3})`;
            }).join(', ');

            if (valueStrings.length > 0) {
                await pool.query(`
                    INSERT INTO locations (bus_id, latitude, longitude)
                    VALUES ${valueStrings}
                `, values);
            }
        } catch (err) {
            console.error('Error flushing bus locations batch to DB:', err.message);
        }
    }

    if (locationBatchQueue.users.length > 0) {
        const batch = [...locationBatchQueue.users];
        locationBatchQueue.users = [];
        try {
            const values = [];
            const valueStrings = batch.map((item, idx) => {
                const base = idx * 3;
                values.push(item.userId, item.latitude, item.longitude);
                return `($${base + 1}, $${base + 2}, $${base + 3})`;
            }).join(', ');

            if (valueStrings.length > 0) {
                await pool.query(`
                    INSERT INTO user_locations (user_id, latitude, longitude)
                    VALUES ${valueStrings}
                `, values);
            }
        } catch (err) {
            console.error('Error flushing user locations batch to DB:', err.message);
        }
    }
}, 30000);

export { redisClient, isRedisConnected };
