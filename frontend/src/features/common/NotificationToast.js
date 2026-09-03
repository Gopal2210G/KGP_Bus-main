import React, { useState, useEffect } from 'react';
import { getSocket } from '../../utils/socket';
import './NotificationToast.css';

export const NotificationToast = () => {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        const socket = getSocket();

        const handleNotification = (data) => {
            if (!data) return;
            const newNotif = {
                id: Date.now() + Math.random(),
                title: data.title || 'Bus Alert',
                message: data.message || 'Location update alert',
                type: data.type || 'info', // 'info', 'warning', 'danger', 'success'
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setNotifications(prev => [newNotif, ...prev.slice(0, 4)]); // Keep max 5 notifications

            // Auto dismiss after 6 seconds
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== newNotif.id));
            }, 6000);
        };

        const handleNetworkStatus = (data) => {
            if (data.status === 'SIGNAL_WEAK') {
                handleNotification({
                    title: 'Low Network Alert',
                    message: `Bus #${data.busId} signal is weak. Estimating location...`,
                    type: 'warning'
                });
            }
        };

        socket.on('system_notification', handleNotification);
        socket.on('bus_network_status', handleNetworkStatus);

        return () => {
            socket.off('system_notification', handleNotification);
            socket.off('bus_network_status', handleNetworkStatus);
        };
    }, []);

    const dismissToast = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    if (notifications.length === 0) return null;

    return (
        <div className="notification-toast-container">
            {notifications.map((n) => (
                <div key={n.id} className={`notification-toast toast-${n.type}`}>
                    <div className="toast-content">
                        <div className="toast-header-row">
                            <span className="toast-title">{n.title}</span>
                            <span className="toast-time">{n.timestamp}</span>
                        </div>
                        <div className="toast-body">{n.message}</div>
                    </div>
                    <button className="toast-close-btn" onClick={() => dismissToast(n.id)}>×</button>
                </div>
            ))}
        </div>
    );
};
