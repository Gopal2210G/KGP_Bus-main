import React, { useState, useEffect, useCallback } from 'react';
import './user.css';
import BusTracking from './bus_tracker/BusTracking';
import BusStopsView from './bus_search/BusStopsView';
import BusStopSearch from './bus_search/BusStopSearch';
import api from '../../utils/api';

const User = () => {
    const [userLocation, setUserLocation] = useState(null);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('kgp_user_active_tab') || 'searchStops');

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        try {
            localStorage.setItem('kgp_user_active_tab', tab);
        } catch (e) {
            console.warn("Could not save active tab to localStorage", e);
        }
    };


    // Function to update user location in the database - use api instead of axios
    const updateUserLocationInDB = useCallback(async () => {
        if (!userLocation) return;
        
        try {
            await api.post('/bus_stops/updateLocation', {
                latitude: userLocation[0],
                longitude: userLocation[1]
            });
        } catch (error) {
            console.error('Error updating user location:', error);
        }
    }, [userLocation]);

    // Get user's location and update state live for pin movement (high accuracy)
    useEffect(() => {
        let geoWatchId;
        if (navigator.geolocation) {
            geoWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserLocation([latitude, longitude]);
                },
                (err) => {
                    console.error("Geolocation error:", err.message);
                    setUserLocation([22.3149, 87.3104]);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );
        }
        return () => {
            if (geoWatchId && navigator.geolocation) {
                navigator.geolocation.clearWatch(geoWatchId);
            }
        };
    }, []);

    // Update user location in the database every 10 minutes
    useEffect(() => {
        if (!userLocation) return;
        
        updateUserLocationInDB();
        
        const locationInterval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        setUserLocation([latitude, longitude]);
                        updateUserLocationInDB();
                    },
                    (err) => {
                        console.error("Geolocation refresh error:", err.message);
                        updateUserLocationInDB();
                    }
                );
            } else {
                updateUserLocationInDB();
            }
        }, 10 * 60 * 1000);
        
        return () => {
            clearInterval(locationInterval);
        };
    }, [userLocation, updateUserLocationInDB]);


    return (
        <div className="map-interface">
            <div className="header-panel">
                <div className="tab-navigation">

                    <button 
                        className={`tab-button ${activeTab === 'searchStops' ? 'active' : ''}`}
                        onClick={() => handleTabChange('searchStops')}
                    >
                        Search Bus Stops
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'busStops' ? 'active' : ''}`}
                        onClick={() => handleTabChange('busStops')}
                    >
                        Search Buses
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'trackBus' ? 'active' : ''}`}
                        onClick={() => handleTabChange('trackBus')}
                    >
                        Track Bus
                    </button>
                </div>
            </div>
            
            <div className="content-area">
                {activeTab === 'busStops' ? (
                    <BusStopsView userLocation={userLocation} setUserLocation={setUserLocation} />
                ) : activeTab === 'trackBus' ? (
                    <BusTracking userLocation={userLocation} setUserLocation={setUserLocation} />
                ) : (
                    <BusStopSearch userLocation={userLocation} setUserLocation={setUserLocation} />
                )}
            </div>
        </div>
    );
};

export default User;