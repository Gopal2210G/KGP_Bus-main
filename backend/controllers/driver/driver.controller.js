import { pool } from '../../config/db.js';
import { ApiError } from '../../utilities/ApiError.js';
import { ApiResponse } from '../../utilities/ApiResponse.js';
import { asyncHandler } from '../../utilities/asyncHandler.js';
import { logger } from '../../utilities/logger.js';

// Get driver's assigned bus with route information
export const getDriverBus = asyncHandler(async (req, res) => {
    // Log the full userData and user objects to debug
    logger.info('Driver controller - req.userData:', req.userData);

    // Get userId directly - we now know it's the correct property name
    const userId = req.userData?.userId;

    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }

    logger.info(`Fetching assigned bus for driver ID: ${userId}`);

    try {
        // Get the bus assigned to this driver
        const busResult = await pool.query(
            `SELECT b.*, bd.user_id 
             FROM buses b
             JOIN bus_drivers bd ON b.id = bd.bus_id
             WHERE bd.user_id = $1`,
            [userId]
        );

        if (busResult.rows.length === 0) {
            logger.info(`No bus assigned to driver ID: ${userId}`);
            return res.status(404).json(
                new ApiResponse(404, null, "No bus assigned to this driver")
            );
        }

        const bus = busResult.rows[0];

        // Get the route for this bus (all stops in order)
        const routeResult = await pool.query(
            `SELECT r.id, r.bus_id, r.stop_order, bs.id as stop_id, bs.name, bs.latitude, bs.longitude
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [bus.id]
        );

        // Get the number of stops cleared
        const stopsCleared = parseInt(bus.stops_cleared || 0);

        // Determine last cleared stop and next stop
        let lastClearedStop = null;
        let nextStop = null;

        if (routeResult.rows.length > 0) {
            const stops = routeResult.rows;

            // Use stopsCleared as array index
            if (stopsCleared === 0) {
                lastClearedStop = null;
                nextStop = stops[0];
            } else {
                lastClearedStop = stops[stopsCleared - 1] || null;
                nextStop = stops[stopsCleared % stops.length] || null;
            }
        }

        const response = {
            bus,
            route: routeResult.rows,
            stopsCleared,
            lastClearedStop,
            nextStop
        };

        logger.info(`Found bus and route for driver ID: ${userId}`);
        return res.status(200).json(
            new ApiResponse(200, response, "Driver bus information fetched successfully")
        );
    } catch (error) {
        logger.error(`Error fetching bus for driver ID: ${userId}`, error);
        throw new ApiError(500, "Error fetching driver bus information");
    }
});

// Update bus location
export const updateLocation = asyncHandler(async (req, res) => {
    // Get userId directly
    const userId = req.userData?.userId;

    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }

    const { busId, latitude, longitude } = req.body;

    if (!busId || !latitude || !longitude) {
        throw new ApiError(400, "Bus ID, latitude and longitude are required");
    }

    logger.info(`Updating location for bus ID: ${busId} by driver ID: ${userId}`);

    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );

        if (verifyResult.rows.length === 0) {
            logger.warn(`Driver ID ${userId} attempted to update location for unassigned bus ID: ${busId}`);
            throw new ApiError(403, "You are not assigned to this bus");
        }

        // Insert new location
        const result = await pool.query(
            `INSERT INTO locations (bus_id, latitude, longitude)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [busId, latitude, longitude]
        );

        logger.info(`Location updated for bus ID: ${busId}`);
        return res.status(200).json(
            new ApiResponse(200, result.rows[0], "Bus location updated successfully")
        );
    } catch (error) {
        logger.error(`Error updating location for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error updating bus location");
    }
});

// Mark a bus stop as cleared (increment stops_cleared counter)
export const clearStop = asyncHandler(async (req, res) => {
    // Get userId directly
    const userId = req.userData?.userId;

    if (!userId) {
        logger.error('Cannot find userId in request', { userData: req.userData });
        throw new ApiError(400, "User ID not found. Please log in again.");
    }

    const { busId, stopId } = req.body;

    if (!busId || !stopId) {
        throw new ApiError(400, "Bus ID and stop ID are required");
    }

    logger.info(`Marking stop ID: ${stopId} as cleared for bus ID: ${busId} by driver ID: ${userId}`);

    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );

        if (verifyResult.rows.length === 0) {
            logger.warn(`Driver ID ${userId} attempted to clear stop for unassigned bus ID: ${busId}`);
            throw new ApiError(403, "You are not assigned to this bus");
        }

        // Verify this stop is in the bus's route
        const routeResult = await pool.query(
            `SELECT * FROM routes WHERE bus_id = $1 AND bus_stop_id = $2`,
            [busId, stopId]
        );

        if (routeResult.rows.length === 0) {
            logger.warn(`Stop ID ${stopId} is not in the route for bus ID: ${busId}`);
            throw new ApiError(404, "This stop is not in the route for this bus");
        }

        // Get the route for this bus (all stops in order)
        const routeStopsResult = await pool.query(
            `SELECT r.id, r.bus_id, r.stop_order, bs.id as stop_id, bs.name, bs.latitude, bs.longitude
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [busId]
        );
        const stops = routeStopsResult.rows;
        const totalStops = stops.length;

        // Get current stops_cleared
        const busResult = await pool.query(
            `SELECT stops_cleared, totalRep, currentRep FROM buses WHERE id = $1`,
            [busId]
        );
        let stopsCleared = parseInt(busResult.rows[0]?.stops_cleared || 0);
        let totalRep = parseInt(busResult.rows[0]?.totalrep || 1);
        let currentRep = parseInt(busResult.rows[0]?.currentrep || 1);

        let result;
        if (totalStops === 0) {
            throw new ApiError(400, "No stops in route");
        }

        // If at last stop, reset to 0 and increment currentRep (wrap if needed)
        if (stopsCleared + 1 >= totalStops) {
            // Wrap currentRep if needed
            const newRep = (currentRep + 1 > totalRep) ? 1 : currentRep + 1;
            result = await pool.query(
                `UPDATE buses 
                 SET stops_cleared = 0, currentRep = $2 
                 WHERE id = $1 
                 RETURNING *`,
                [busId, newRep]
            );
            logger.info(`Last stop reached for bus ID: ${busId}. Incrementing currentRep and resetting stops_cleared.`);
        } else {
            // Just increment stops_cleared
            result = await pool.query(
                `UPDATE buses SET stops_cleared = stops_cleared + 1 WHERE id = $1 RETURNING *`,
                [busId]
            );
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                result.rows[0],
                stopsCleared + 1 >= totalStops ?
                    "Last bus stop cleared, new repetition started" :
                    "Bus stop marked as cleared"
            )
        );
    } catch (error) {
        logger.error(`Error clearing stop for bus ID: ${busId}`, error);
        throw new ApiError(500, "Error marking bus stop as cleared");
    }
});

// Get trip options for a specific bus (scheduled times and route stops)
export const getTripOptions = asyncHandler(async (req, res) => {
    const busId = req.params.id;
    const userId = req.userData?.userId;

    if (!busId) {
        throw new ApiError(400, "Bus ID is required");
    }

    logger.info(`Getting trip options for bus ID: ${busId} for driver ID: ${userId}`);

    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );

        if (verifyResult.rows.length === 0) {
            logger.warn(`Driver ID ${userId} attempted to get trip options for unassigned bus ID: ${busId}`);
            throw new ApiError(403, "You are not assigned to this bus");
        }

        // Get all scheduled start times for this bus - we need to return the time in a consistent format
        const timesResult = await pool.query(
            `SELECT id, rep_no, 
             to_char(start_time, 'HH24:MI:SS') as formatted_time,
             start_time
             FROM bus_start_time 
             WHERE bus_id = $1 
             ORDER BY rep_no`,
            [busId]
        );

        // Get all stops in the route for this bus - include time_from_start
        const stopsResult = await pool.query(
            `SELECT r.id, r.bus_id, r.stop_order, r.time_from_start,
             bs.id as stop_id, bs.name, bs.latitude, bs.longitude
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [busId]
        );

        const response = {
            scheduledTimes: timesResult.rows.map(time => ({
                id: time.id,
                rep_no: time.rep_no,
                start_time: time.formatted_time // Use the formatted time string
            })),
            routeStops: stopsResult.rows.map(stop => ({
                id: stop.id,
                bus_id: stop.bus_id,
                stop_order: stop.stop_order,
                stop_id: stop.stop_id,
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                time_from_start: parseFloat(stop.time_from_start || 0).toFixed(2) // Ensure it's a number with 2 decimal places
            }))
        };

        logger.info(`Found ${response.scheduledTimes.length} start times and ${response.routeStops.length} stops for bus ID: ${busId}`);
        return res.status(200).json(
            new ApiResponse(200, response, "Trip options fetched successfully")
        );
    } catch (error) {
        logger.error(`Error fetching trip options for bus ID: ${busId}`, error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, "Error fetching trip options");
    }
});

// Initialize a trip with selected start time and next stop
export const initializeTrip = asyncHandler(async (req, res) => {
    const userId = req.userData?.userId;
    const { busId, startTime, nextStopId, nextStopSequence } = req.body;

    if (!busId || !startTime || nextStopSequence === undefined) {
        throw new ApiError(400, "Bus ID, start time, and next stop index are required");
    }

    try {
        // Verify this driver is assigned to this bus
        const verifyResult = await pool.query(
            `SELECT * FROM bus_drivers WHERE user_id = $1 AND bus_id = $2`,
            [userId, busId]
        );

        if (verifyResult.rows.length === 0) {
            throw new ApiError(403, "You are not assigned to this bus");
        }

        // Get the route for this bus (all stops in order)
        const routeResult = await pool.query(
            `SELECT r.id, r.bus_id, r.stop_order, bs.id as stop_id, bs.name, bs.latitude, bs.longitude
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [busId]
        );
        const route = routeResult.rows;

        const stopsCleared = parseInt(nextStopSequence, 10);

        // Determine which repetition (currentRep) we're on based on the selected start time
        const startTimeResult = await pool.query(
            `SELECT rep_no FROM bus_start_time 
             WHERE bus_id = $1 AND to_char(start_time, 'HH24:MI:SS') = $2`,
            [busId, startTime]
        );
        let repNo = 1;
        if (startTimeResult.rows.length > 0) {
            repNo = parseInt(startTimeResult.rows[0].rep_no);
        }

        // Update the bus with the new currentRep and stops_cleared
        const updateResult = await pool.query(
            `UPDATE buses SET currentRep = $1, stops_cleared = $2 WHERE id = $3 RETURNING *`,
            [repNo, stopsCleared, busId]
        );

        // Determine next stop based on the index
        const nextStop = route[nextStopSequence];

        const response = {
            success: true,
            data: {
                bus: updateResult.rows[0],
                route: route,
                stopsCleared,
                nextStop: nextStop || null
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, "Error initializing trip");
    }
});

// Get driver's 7-day schedule of assigned rides
export const getDriverSchedule = asyncHandler(async (req, res) => {
    const userId = req.userData?.userId;

    if (!userId) {
        throw new ApiError(400, "User ID not found in request");
    }

    try {
        // Fetch assigned bus
        const busResult = await pool.query(
            `SELECT b.* FROM buses b
             JOIN bus_drivers bd ON b.id = bd.bus_id
             WHERE bd.user_id = $1`,
            [userId]
        );

        if (busResult.rows.length === 0) {
            return res.status(200).json(new ApiResponse(200, { bus: null, schedule: [] }, "No bus assigned"));
        }

        const bus = busResult.rows[0];

        // Fetch start times
        const timesResult = await pool.query(
            `SELECT id, rep_no, to_char(start_time, 'HH24:MI:SS') as start_time
             FROM bus_start_time
             WHERE bus_id = $1
             ORDER BY rep_no`,
            [bus.id]
        );

        // Fetch route summary (first and last stop)
        const routeResult = await pool.query(
            `SELECT r.stop_order, bs.name
             FROM routes r
             JOIN bus_stops bs ON r.bus_stop_id = bs.id
             WHERE r.bus_id = $1
             ORDER BY r.stop_order`,
            [bus.id]
        );

        const stops = routeResult.rows;
        const origin = stops[0]?.name || 'Origin';
        const destination = stops[stops.length - 1]?.name || 'Destination';

        // Fetch cancellations for this bus for upcoming 7 days
        const cancellationsResult = await pool.query(
            `SELECT bus_id, rep_no, to_char(trip_date, 'YYYY-MM-DD') as trip_date, reason, cancelled_at
             FROM kgp_bus_track.cancelled_trips
             WHERE bus_id = $1 AND trip_date >= CURRENT_DATE AND trip_date <= CURRENT_DATE + INTERVAL '7 days'`,
            [bus.id]
        );

        const cancellationsMap = {};
        cancellationsResult.rows.forEach(c => {
            cancellationsMap[`${c.trip_date}_${c.rep_no}`] = c;
        });

        // Generate 7-day date schedule
        const schedule = [];
        const today = new Date();

        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            const dateTrips = timesResult.rows.map(t => {
                const cancelKey = `${dateStr}_${t.rep_no}`;
                const cancelInfo = cancellationsMap[cancelKey];

                return {
                    rep_no: t.rep_no,
                    start_time: t.start_time,
                    is_cancelled: !!cancelInfo,
                    cancel_reason: cancelInfo ? cancelInfo.reason : null,
                    cancelled_at: cancelInfo ? cancelInfo.cancelled_at : null
                };
            });

            schedule.push({
                date: dateStr,
                dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                trips: dateTrips
            });
        }

        return res.status(200).json(
            new ApiResponse(200, {
                bus,
                origin,
                destination,
                totalStops: stops.length,
                schedule
            }, "Driver 7-day schedule fetched successfully")
        );
    } catch (error) {
        logger.error(`Error fetching driver schedule for user ${userId}:`, error);
        throw new ApiError(500, "Failed to fetch driver schedule");
    }
});
