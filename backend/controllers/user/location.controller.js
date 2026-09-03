import { pool } from "../../config/db.js";
import { asyncHandler } from "../../utilities/asyncHandler.js";

// Update the current user's location
export const updateLocation = asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    const userId = req.userData.userId;

    // Validate coordinates
    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    try {
        // Insert the user's location
        const result = await pool.query(
            `INSERT INTO user_locations (user_id, latitude, longitude) 
             VALUES ($1, $2, $3)
             RETURNING id, latitude, longitude, timestamp`,
            [userId, latitude, longitude]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ message: 'Error updating location', error: error.message });
    }
});

// Get the current user's latest location
export const getUserLocation = asyncHandler(async (req, res) => {
    const userId = req.userData.userId;

    try {
        const result = await pool.query(
            `SELECT latitude, longitude, timestamp
             FROM user_locations
             WHERE user_id = $1
             ORDER BY timestamp DESC
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No location found for this user' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user location:', error);
        res.status(500).json({ message: 'Error fetching location', error: error.message });
    }
});

// Get all current bus locations - for regular users to see buses
export const getBusLocations = asyncHandler(async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT l.bus_id, l.latitude, l.longitude, l.timestamp, b.name as bus_name
             FROM locations l
             JOIN buses b ON l.bus_id = b.id
             WHERE l.timestamp > (NOW() - INTERVAL '1 hour')
             ORDER BY l.bus_id, l.timestamp DESC`
        );

        // Process to get only the latest location for each bus
        const latestByBus = {};
        result.rows.forEach(row => {
            if (!latestByBus[row.bus_id] ||
                new Date(row.timestamp) > new Date(latestByBus[row.bus_id].timestamp)) {
                latestByBus[row.bus_id] = row;
            }
        });

        const busLocations = Object.values(latestByBus).map(loc => ({
            id: loc.bus_id,
            name: loc.bus_name,
            location: {
                latitude: parseFloat(loc.latitude),
                longitude: parseFloat(loc.longitude)
            },
            timestamp: loc.timestamp
        }));

        res.json(busLocations);
    } catch (error) {
        console.error('Error fetching bus locations:', error);
        res.status(500).json({ message: 'Error fetching bus locations', error: error.message });
    }
});

// Get all user locations (admin only)
export const getAllUserLocations = asyncHandler(async (req, res) => {
    try {
        // Fetch ALL registered users (drivers, admins, users).
        // For drivers, check their assigned bus location in `locations` as well as `user_locations`.
        const result = await pool.query(`
            SELECT DISTINCT ON (u.id)
                u.id AS user_id,
                u.username AS username,
                u.email AS "fullName",
                u.role AS type,
                CASE 
                    WHEN loc.timestamp IS NOT NULL AND (ul.timestamp IS NULL OR loc.timestamp >= ul.timestamp) 
                    THEN loc.id 
                    ELSE ul.id 
                END AS _id,
                CASE 
                    WHEN loc.timestamp IS NOT NULL AND (ul.timestamp IS NULL OR loc.timestamp >= ul.timestamp) 
                    THEN loc.latitude 
                    ELSE ul.latitude 
                END AS latitude,
                CASE 
                    WHEN loc.timestamp IS NOT NULL AND (ul.timestamp IS NULL OR loc.timestamp >= ul.timestamp) 
                    THEN loc.longitude 
                    ELSE ul.longitude 
                END AS longitude,
                CASE 
                    WHEN loc.timestamp IS NOT NULL AND (ul.timestamp IS NULL OR loc.timestamp >= ul.timestamp) 
                    THEN loc.timestamp 
                    ELSE ul.timestamp 
                END AS timestamp
            FROM users u
            LEFT JOIN bus_drivers bd ON u.id = bd.user_id
            LEFT JOIN LATERAL (
                SELECT id, bus_id, latitude, longitude, timestamp
                FROM locations
                WHERE bus_id = bd.bus_id
                ORDER BY timestamp DESC
                LIMIT 1
            ) loc ON TRUE
            LEFT JOIN LATERAL (
                SELECT id, user_id, latitude, longitude, timestamp
                FROM user_locations
                WHERE user_id = u.id
                ORDER BY timestamp DESC
                LIMIT 1
            ) ul ON TRUE
            ORDER BY u.id
        `);

        // Parse latitude and longitude safely
        const locations = result.rows.map(row => {
            const hasCoords = row.latitude !== null && row.longitude !== null && 
                              row.latitude !== undefined && row.longitude !== undefined;
            return {
                _id: row._id || row.user_id,
                user_id: row.user_id,
                username: row.username || 'User #' + row.user_id,
                fullName: row.fullName || '', 
                type: row.type || 'user',
                role: row.type || 'user',
                coordinates: hasCoords ? {
                    latitude: parseFloat(row.latitude),
                    longitude: parseFloat(row.longitude)
                } : null,
                latitude: hasCoords ? parseFloat(row.latitude) : null,
                longitude: hasCoords ? parseFloat(row.longitude) : null,
                timestamp: row.timestamp || null
            };
        });
        
        res.json(locations);
    } catch (error) {
        console.error('Error fetching all user locations:', error);
        res.status(500).json({ message: 'Error fetching user locations', error: error.message });
    }
});


