import { Server } from 'socket.io';
import { setLiveBusLocation, setLiveUserLocation, queueLocationForBatchInsert } from './config/redis.js';

let io = null;
const driverHeartbeats = new Map(); // busId -> lastPingTime

export const initSocket = (httpServer) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL_LOCAL || 'http://localhost:3000,https://kgp-bus-frontend.vercel.app')
        .split(',')
        .map(url => url.trim());

    const isAllowedOrigin = (origin) => {
        if (!origin) return true;
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return true;
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
        if (origin.startsWith('http://10.') || origin.startsWith('http://192.168.') || origin.startsWith('http://172.')) return true;
        if (origin.endsWith('.vercel.app') || origin.endsWith('.render.com') || origin.endsWith('.netlify.app')) return true;
        return false;
    };

    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (isAllowedOrigin(origin)) {
                    return callback(null, true);
                }
                callback(null, true); // Fallback to allow connection
            },
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: 10000,
        pingInterval: 5000
    });

    io.on('connection', (socket) => {
        // Room Subscriptions
        socket.on('join_room', (roomName) => {
            socket.join(roomName);
        });

        socket.on('leave_room', (roomName) => {
            socket.leave(roomName);
        });

        socket.on('subscribe_bus', (busId) => {
            socket.join(`bus_${busId}`);
        });

        socket.on('unsubscribe_bus', (busId) => {
            socket.leave(`bus_${busId}`);
        });

        socket.on('subscribe_admin_tracking', () => {
            socket.join('admin_user_tracking');
        });

        // Driver Live Location Update
        socket.on('driver_location_update', async (data) => {
            if (!data || !data.busId) return;

            // Record driver heartbeat
            driverHeartbeats.set(String(data.busId), Date.now());

            const locationPayload = {
                busId: data.busId,
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                speed: parseFloat(data.speed || 0),
                heading: parseFloat(data.heading || 0),
                timestamp: new Date().toISOString()
            };

            // 1. Write to Redis In-Memory Cache (<1ms)
            await setLiveBusLocation(data.busId, locationPayload);

            // 2. Queue for 30s Database Batching
            queueLocationForBatchInsert('bus', locationPayload);

            // 3. Broadcast to all subscribed passengers & Admin
            io.to('active_buses').to(`bus_${data.busId}`).to('admin_user_tracking').emit('bus_location_changed', locationPayload);
        });

        // Driver Heartbeat Ping
        socket.on('driver_ping', (data) => {
            if (data && data.busId) {
                driverHeartbeats.set(String(data.busId), Date.now());
                socket.emit('driver_pong', { status: 'ONLINE', timestamp: Date.now() });
            }
        });

        // Passenger / User Live Location Update
        socket.on('user_location_update', async (data) => {
            if (!data || !data.userId) return;

            const userPayload = {
                userId: data.userId,
                username: data.username || `User #${data.userId}`,
                role: data.role || 'user',
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                timestamp: new Date().toISOString()
            };

            // 1. Write to Redis
            await setLiveUserLocation(data.userId, userPayload);

            // 2. Queue for 30s DB batch
            queueLocationForBatchInsert('user', userPayload);

            // 3. Broadcast to Admin tracking room
            io.to('admin_user_tracking').emit('user_location_changed', userPayload);
        });

        // Broadcast Notification Event
        socket.on('send_system_announcement', (data) => {
            io.emit('system_notification', data);
        });

        socket.on('disconnect', () => {
            // Socket disconnected
        });
    });

    // Monitor Driver Heartbeats for Offline / Low-Network detection
    setInterval(() => {
        const now = Date.now();
        driverHeartbeats.forEach((lastPing, busId) => {
            if (now - lastPing > 15000) { // 15 seconds without ping/update
                io.to(`bus_${busId}`).to('admin_user_tracking').emit('bus_network_status', {
                    busId,
                    status: 'SIGNAL_WEAK',
                    lastSeenMsAgo: now - lastPing
                });
            }
        });
    }, 5000);

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};
