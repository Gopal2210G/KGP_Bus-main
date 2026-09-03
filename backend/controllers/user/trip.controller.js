import { pool } from '../../config/db.js';
import { ApiResponse } from '../../utilities/ApiResponse.js';
import { asyncHandler } from '../../utilities/asyncHandler.js';
import { logger } from '../../utilities/logger.js';
import { getIO } from '../../socket.js';

// Helper function to check if trip is within 1 hour of scheduled time
function isWithinOneHour(tripDateStr, startTimeStr) {
    if (!startTimeStr) return true; // Default to true if no specific time provided
    const now = new Date();
    
    const dateStr = tripDateStr || now.toISOString().split('T')[0];
    const dateParts = dateStr.split('-');
    const timeParts = startTimeStr.split(':');
    
    const scheduled = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        parseInt(timeParts[0] || 0, 10),
        parseInt(timeParts[1] || 0, 10),
        parseInt(timeParts[2] || 0, 10)
    );
    
    const diffMinutes = (scheduled.getTime() - now.getTime()) / (1000 * 60);
    // Return true if scheduled start is within 60 minutes or up to 2 hours after start
    return diffMinutes <= 60 && diffMinutes >= -120;
}

// Cancel a scheduled trip for a bus
export const cancelTrip = asyncHandler(async (req, res) => {
    const { bus_id, rep_no, start_time, trip_date, reason } = req.body;

    if (!bus_id) {
        return res.status(400).json(new ApiResponse(400, null, "bus_id is required"));
    }

    const tripRep = parseInt(rep_no || 1);
    const cancelReason = reason || 'Trip cancelled by driver/admin';
    const targetDate = trip_date || new Date().toISOString().split('T')[0];

    try {
        logger.info(`Cancelling trip for bus ID: ${bus_id}, rep: ${tripRep}, date: ${targetDate}`);

        const result = await pool.query(`
            INSERT INTO kgp_bus_track.cancelled_trips (bus_id, rep_no, trip_date, start_time, reason)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (bus_id, rep_no, trip_date) 
            DO UPDATE SET start_time = EXCLUDED.start_time, reason = EXCLUDED.reason, cancelled_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [bus_id, tripRep, targetDate, start_time || null, cancelReason]);

        const cancelledTrip = result.rows[0];

        // Emit Socket.io real-time update ONLY IF within 1 hour of scheduled trip time
        const shouldNotify = isWithinOneHour(targetDate, start_time);
        if (shouldNotify) {
            try {
                const io = getIO();
                if (io) {
                    const eventPayload = {
                        busId: bus_id,
                        repNo: tripRep,
                        tripDate: targetDate,
                        isCancelled: true,
                        reason: cancelReason,
                        cancelledAt: cancelledTrip.cancelled_at
                    };
                    io.emit('trip_status_changed', eventPayload);
                    io.to('active_buses').emit('trip_status_changed', eventPayload);
                    io.to(`bus_${bus_id}`).emit('trip_status_changed', eventPayload);
                }
            } catch (socketErr) {
                logger.warn('Socket broadcast failed for trip cancellation:', socketErr.message);
            }
        } else {
            logger.info(`Trip cancellation for bus ID ${bus_id} saved quietly (outside 1-hour broadcast window)`);
        }

        return res.status(200).json(new ApiResponse(200, cancelledTrip, "Trip cancelled successfully"));
    } catch (error) {
        logger.error(`Error cancelling trip for bus ID ${bus_id}:`, error);
        return res.status(500).json(new ApiResponse(500, null, "Failed to cancel trip"));
    }
});

// Uncancel / Reactivate a scheduled trip
export const uncancelTrip = asyncHandler(async (req, res) => {
    const { bus_id, rep_no, trip_date, start_time } = req.body;

    if (!bus_id) {
        return res.status(400).json(new ApiResponse(400, null, "bus_id is required"));
    }

    const tripRep = parseInt(rep_no || 1);
    const targetDate = trip_date || new Date().toISOString().split('T')[0];

    try {
        logger.info(`Reactivating trip for bus ID: ${bus_id}, rep: ${tripRep}, date: ${targetDate}`);

        await pool.query(`
            DELETE FROM kgp_bus_track.cancelled_trips 
            WHERE bus_id = $1 AND rep_no = $2 AND trip_date = $3;
        `, [bus_id, tripRep, targetDate]);

        // Emit Socket.io real-time update ONLY IF within 1 hour
        const shouldNotify = isWithinOneHour(targetDate, start_time);
        if (shouldNotify) {
            try {
                const io = getIO();
                if (io) {
                    const eventPayload = {
                        busId: bus_id,
                        repNo: tripRep,
                        tripDate: targetDate,
                        isCancelled: false,
                        reason: null
                    };
                    io.emit('trip_status_changed', eventPayload);
                    io.to('active_buses').emit('trip_status_changed', eventPayload);
                    io.to(`bus_${bus_id}`).emit('trip_status_changed', eventPayload);
                }
            } catch (socketErr) {
                logger.warn('Socket broadcast failed for trip reactivation:', socketErr.message);
            }
        }

        return res.status(200).json(new ApiResponse(200, { bus_id, rep_no: tripRep, trip_date: targetDate }, "Trip reactivated successfully"));
    } catch (error) {
        logger.error(`Error reactivating trip for bus ID ${bus_id}:`, error);
        return res.status(500).json(new ApiResponse(500, null, "Failed to reactivate trip"));
    }
});

// Get all cancelled trips
export const getCancelledTrips = asyncHandler(async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM kgp_bus_track.cancelled_trips ORDER BY cancelled_at DESC');
        return res.status(200).json(new ApiResponse(200, result.rows, "Cancelled trips fetched successfully"));
    } catch (error) {
        logger.error("Error fetching cancelled trips:", error);
        return res.status(500).json(new ApiResponse(500, null, "Failed to fetch cancelled trips"));
    }
});
