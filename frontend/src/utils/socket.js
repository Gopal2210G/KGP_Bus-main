import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_API_BASE_URL 
  ? process.env.REACT_APP_API_BASE_URL.replace('/api', '')
  : (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://kgp-bus-service.onrender.com');

let socket = null;

export const getSocket = () => {
    if (!socket) {
        socket = io(BACKEND_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        socket.on('connect', () => {
            // Connected to WebSockets server
        });

        socket.on('disconnect', (reason) => {
            console.warn('⚠️ WebSockets disconnected:', reason);
        });

        socket.on('connect_error', (err) => {
            console.warn('⚠️ Socket connection error:', err.message);
        });
    }
    return socket;
};

export const subscribeToBus = (busId, callback) => {
    const s = getSocket();
    s.emit('subscribe_bus', busId);
    s.emit('join_room', 'active_buses');

    const handler = (data) => {
        if (data && String(data.busId) === String(busId)) {
            callback(data);
        }
    };

    s.on('bus_location_changed', handler);
    return () => {
        s.off('bus_location_changed', handler);
        s.emit('unsubscribe_bus', busId);
    };
};

export const subscribeToAllBuses = (callback) => {
    const s = getSocket();
    s.emit('join_room', 'active_buses');

    s.on('bus_location_changed', callback);
    return () => {
        s.off('bus_location_changed', callback);
        s.emit('leave_room', 'active_buses');
    };
};

export const subscribeToAdminTracking = (callback) => {
    const s = getSocket();
    s.emit('subscribe_admin_tracking');

    const busHandler = (data) => callback({ type: 'bus', data });
    const userHandler = (data) => callback({ type: 'user', data });

    s.on('bus_location_changed', busHandler);
    s.on('user_location_changed', userHandler);

    return () => {
        s.off('bus_location_changed', busHandler);
        s.off('user_location_changed', userHandler);
    };
};

export const emitDriverLocation = (payload) => {
    const s = getSocket();
    if (s && s.connected) {
        s.emit('driver_location_update', payload);
    }
};

export const emitUserLocation = (payload) => {
    const s = getSocket();
    if (s && s.connected) {
        s.emit('user_location_update', payload);
    }
};
