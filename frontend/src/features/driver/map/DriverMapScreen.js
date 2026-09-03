import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../../../utils/api2.js';
import { computeDynamicEta, calculateMovingAverageSpeed } from '../../../utils/etaEngine.js';
import { snapToRoutePolyline } from '../../../utils/snapToRoad.js';
import './DriverMapScreen.css';
import TripInitModal from './TripInitModal';

axios.defaults.withCredentials = true;

// Fix for default marker icon in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/30/30979.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

// Bus stop icon
const busStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

// Next stop icon (highlighted)
const nextStopIcon = new L.Icon({
  iconUrl: '/images/bus-stop.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});



// Component to handle map centering and resizing
const MapController = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    // Invalidate map size on tab change or container resize
    const timer = setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 150);

    if (center) {
      map.setView(center, zoom || map.getZoom());
    }

    return () => clearTimeout(timer);
  }, [center, zoom, map]);

  return null;
};

// Configure OSRM routing to load faster - similar to BusStopSearch.js approach
function configureRoutingMachine() {
  if (typeof L !== 'undefined' && L.Routing) {
    L.Routing.Itinerary.prototype.options.createGeocoderPane = false;
    L.Routing.timeout = 30 * 1000;

    if (L.Routing.ErrorControl && L.Routing.ErrorControl.prototype) {
      L.Routing.ErrorControl.prototype._routingErrorHandler = function (e) {
        console.warn("Handled routing error:", e);
      };
    }

    if (L.Routing.Line && L.Routing.Line.prototype) {
      const originalClearLines = L.Routing.Line.prototype._clearLines;
      L.Routing.Line.prototype._clearLines = function () {
        try {
          if (this._map && this._route && this._route._layers) {
            originalClearLines.call(this);
          }
        } catch (e) {
          console.warn("Protected from _clearLines error:", e);
          if (this._map && this._route) {
            try {
              this._map.removeLayer(this._route);
            } catch (e) {
              console.warn("Also failed with manual cleanup:", e);
            }
          }
        }
      };
    }

    if (!window.L.Routing._routingControls) {
      window.L.Routing._routingControls = [];
    }
  }
}

// Improved OSRM routes component using BusStopSearch.js approach
const OsrmRoutes = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex, onRoutePolylineLoaded }) => {
  const map = useMap();
  const routeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const drawnStopsKeyRef = useRef('');

  const routingControlsRef = useRef([]);
  const isInitialRenderRef = useRef(true);

  const clearAllRoutingControls = useCallback(() => {
    if (routingControlsRef.current.length > 0) {
      routingControlsRef.current.forEach(control => {
        try {
          if (map && control && map.hasLayer(control)) {
            control.remove();
          }
        } catch (e) {
          console.warn("Error removing routing control:", e);
        }
      });
      routingControlsRef.current = [];
    }
  }, [map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllRoutingControls();
    };
  }, [clearAllRoutingControls]);

  useEffect(() => {
    configureRoutingMachine();
  }, []);

  useEffect(() => {
    if (!stops || stops.length < 2 || !map) return;

    const currentStopsKey = stops.map(s => `${s.id || s.stop_id}_${s.latitude}_${s.longitude}`).join('|');

    // If already drawn for these stops, do NOT re-draw or trigger loading overlay
    if (!isInitialRenderRef.current && (drawnStopsKeyRef.current === currentStopsKey || routeRef.current)) {
      return;
    }

    const fetchAndDrawFullRoute = async () => {
      try {
        // Only set loading overlay on absolute first initial render
        if (isInitialRenderRef.current) {
          setIsLoading(true);
        }

        // Clear previously drawn routes before adding new ones
        clearAllRoutingControls();

        if (routeRef.current) {
          try {
            if (map.hasLayer(routeRef.current)) {
              map.removeLayer(routeRef.current);
            }
          } catch (err) {
            console.warn("Protected from removeLayer error:", err);
          }
          routeRef.current = null;
        }

        const waypoints = stops.map(stop => [
          parseFloat(stop.latitude),
          parseFloat(stop.longitude)
        ]).filter(coords => !isNaN(coords[0]) && !isNaN(coords[1]));

        if (waypoints.length < 2) {
          console.warn("Not enough valid waypoints for route");
          setIsLoading(false);
          return;
        }

        try {
          const routingControl = L.Routing.control({
            waypoints: waypoints.map(coords => L.latLng(coords[0], coords[1])),
            routeWhileDragging: false,
            showAlternatives: false,
            addWaypoints: false,
            fitSelectedRoutes: false,
            show: false,
            lineOptions: {
              styles: [{ color: '#3388ff', opacity: 0.7, weight: 4 }],
              extendToWaypoints: true,
              missingRouteTolerance: 10
            },
            createMarker: () => null,
            serviceUrl: 'https://router.project-osrm.org/route/v1'
          });

          if (window.L.Routing._routingControls) {
            window.L.Routing._routingControls.push(routingControl);
          }

          routingControlsRef.current.push(routingControl);
          routeRef.current = routingControl; // Store reference to active routing control
          drawnStopsKeyRef.current = currentStopsKey;

          routingControl.on('routesfound', (e) => {
            if (e.routes && e.routes.length > 0) {
              if (onRoutePolylineLoaded && e.routes[0].coordinates) {
                const roadCoords = e.routes[0].coordinates.map(c => [c.lat, c.lng]);
                onRoutePolylineLoaded(roadCoords);
              }
              setIsLoading(false);
              isInitialRenderRef.current = false;
            }
          });

          routingControl.on('routingerror', (e) => {
            console.warn("Routing error occurred:", e);
            setIsLoading(false);
            isInitialRenderRef.current = false;
          });

          setTimeout(() => {
            if (map && routingControl) {
              try {
                routingControl.addTo(map);
              } catch (err) {
                console.error("Error adding routing control to map:", err);
                setIsLoading(false);
              }
            }
          }, 100);
        } catch (err) {
          console.error("Error creating routing control:", err);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error setting up full route:', error);
        setIsLoading(false);
      }
    };

    fetchAndDrawFullRoute();

  }, [map, stops, clearAllRoutingControls, onRoutePolylineLoaded]);

  return isLoading ? (
    <div className="osrm-loading-overlay">
      <div className="osrm-loading-content">
        <div className="osrm-spinner"></div>
        <p>Drawing routes...</p>
      </div>
    </div>
  ) : null;
};

// Improved location tracking with high accuracy and aggressive options
const DriverLocationTracker = ({ setPosition }) => {
  const map = useMapEvents({
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
    locationerror(e) {
      console.error('Location error:', e.message);
      alert('Could not get your location. Please enable location services and reload.');
    }
  });

  useEffect(() => {
    // Aggressive options for best accuracy
    const locationOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    };

    // Use browser geolocation API directly for best results
    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setPosition([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        locationOptions
      );
    }

    // Also use leaflet locate as fallback
    map.locate({ ...locationOptions, watch: true });

    return () => {
      if (watchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      map.stopLocate();
    };
  }, [map, setPosition]);

  return null;
};

// Component to update driver's location in the database
const LocationUpdater = ({ driverId, busId, position }) => {
  useEffect(() => {
    if (!position || !busId) return;

    const updateLocation = async () => {
      try {
        await axios.post(
          getApiUrl('/driver/update-location'),
          {
            busId,
            latitude: position[0],
            longitude: position[1]
          },
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };

    updateLocation();

    const interval = setInterval(updateLocation, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [position, busId, driverId]);

  return null;
};

// Component to detect proximity to next bus stop
const ProximityDetector = ({ busId, position, nextStop, busInfo, onStopReached }) => {
  useEffect(() => {
    if (!position || !nextStop || !busId || !busInfo) return;

    const checkProximity = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];

      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));

      if (distance <= 30 && nextStop.stop_id === busInfo.nextStop?.stop_id) {
        onStopReached(busId, nextStop.stop_id);
      }
    };

    const interval = setInterval(checkProximity, 1000);

    return () => clearInterval(interval);
  }, [position, nextStop, busId, busInfo, onStopReached]);

  return null;
};

// Component to keep bus in view
const KeepBusInView = ({ position, userZoomed, setUserZoomed }) => {
  const map = useMap();
  const [lastPosition, setLastPosition] = useState(null);
  const initialSetupRef = useRef(true);

  // Add map event handler for zoom changes
  useMapEvents({
    zoomstart: () => {
      setUserZoomed(true);
    },
    dragstart: () => {
      setUserZoomed(true);
    }
  });

  useEffect(() => {
    if (!position || !map) return;

    // Set maximum zoom on initial position
    if (initialSetupRef.current) {
      map.setView(position, 17);
      initialSetupRef.current = false;
      return;
    }

    if (lastPosition &&
      position[0] === lastPosition[0] &&
      position[1] === lastPosition[1]) {
      return;
    }

    setLastPosition(position);

    // Smoothly pan camera to driver's location if auto-follow is active
    if (!userZoomed) {
      map.panTo(position, { animate: true, duration: 0.8 });
    }
  }, [map, position, lastPosition, userZoomed]);

  return null;
};

// Component to update next stop distance & dynamic ETA in the UI
const NextStopDistanceUpdater = ({ position, nextStop }) => {
  useEffect(() => {
    if (!position || !nextStop) return;

    const updateDistance = () => {
      const nextStopPosition = [
        parseFloat(nextStop.latitude),
        parseFloat(nextStop.longitude)
      ];

      // Calculate distance between driver and next stop (in meters)
      const distance = L.latLng(position).distanceTo(L.latLng(nextStopPosition));

      // Calculate live moving speed and dynamic ETA
      const currentSpeedKmh = calculateMovingAverageSpeed([{ latitude: position[0], longitude: position[1], timestampMs: Date.now() }]);
      const eta = computeDynamicEta({ latitude: position[0], longitude: position[1] }, { latitude: nextStopPosition[0], longitude: nextStopPosition[1] }, currentSpeedKmh);

      // Update the distance display in the UI
      const distanceElement = document.getElementById('next-stop-distance');
      if (distanceElement) {
        distanceElement.textContent = `${Math.round(distance)} meters (${eta.statusText})`;
      }
    };

    // Update immediately and then every second
    updateDistance();
    const interval = setInterval(updateDistance, 1000);

    return () => clearInterval(interval);
  }, [position, nextStop]);

  return null;
};

// Simplified permanent directions component
const PermanentDirections = ({ stops, currentPosition, lastClearedStopIndex, nextStopIndex }) => {
  const [direction, setDirection] = useState(null);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    if (!stops || !currentPosition || nextStopIndex === null || !stops[nextStopIndex]) return;

    const nextStop = stops[nextStopIndex];

    const calculateDirections = () => {
      try {
        const currentPos = L.latLng(currentPosition);
        const nextStopPos = L.latLng(
          parseFloat(nextStop.latitude),
          parseFloat(nextStop.longitude)
        );

        const distanceToNext = currentPos.distanceTo(nextStopPos);
        setDistance(Math.round(distanceToNext));

        const bearing = calculateBearing(currentPos, nextStopPos);

        if (bearing >= 337.5 || bearing < 22.5) {
          setDirection('north');
        } else if (bearing >= 22.5 && bearing < 67.5) {
          setDirection('northeast');
        } else if (bearing >= 67.5 && bearing < 112.5) {
          setDirection('east');
        } else if (bearing >= 112.5 && bearing < 157.5) {
          setDirection('southeast');
        } else if (bearing >= 157.5 && bearing < 202.5) {
          setDirection('south');
        } else if (bearing >= 202.5 && bearing < 247.5) {
          setDirection('southwest');
        } else if (bearing >= 247.5 && bearing < 292.5) {
          setDirection('west');
        } else {
          setDirection('northwest');
        }
      } catch (err) {
        console.warn("Direction calculation error:", err);
      }
    };

    calculateDirections();
    const interval = setInterval(calculateDirections, 1000);

    return () => clearInterval(interval);
  }, [stops, currentPosition, nextStopIndex]);

  // Helper function to calculate bearing between two points
  const calculateBearing = (start, end) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;

    return bearing;
  };

  // Always render the directions panel
  return (
    <div className="permanent-directions">
      <div className="direction-icon">
        {direction === 'north' && <i className="fas fa-arrow-up"></i>}
        {direction === 'northeast' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'east' && <i className="fas fa-arrow-right"></i>}
        {direction === 'southeast' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(-45deg)' }}></i>}
        {direction === 'south' && <i className="fas fa-arrow-down"></i>}
        {direction === 'southwest' && <i className="fas fa-arrow-down" style={{ transform: 'rotate(45deg)' }}></i>}
        {direction === 'west' && <i className="fas fa-arrow-left"></i>}
        {direction === 'northwest' && <i className="fas fa-arrow-up" style={{ transform: 'rotate(-45deg)' }}></i>}
      </div>
      <div className="direction-text">
        <p>Head <strong>{direction || 'forward'}</strong> for {distance !== null ? `${distance}m` : 'calculating...'}</p>
        <p>Next stop: <strong>{stops[nextStopIndex]?.name || stops[nextStopIndex]?.stop_name || `Stop #${nextStopIndex + 1}`}</strong></p>
      </div>
    </div>
  );
};

function DriverMapScreen() {
  const [position, setPosition] = useState(null);
  const [center, setCenter] = useState(null);
  const [zoom, setZoom] = useState(19); // Start with maximum zoom level (19)
  const [busInfo, setBusInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userZoomed, setUserZoomed] = useState(false); // Track if user manually zoomed
  const [roadPolylineCoords, setRoadPolylineCoords] = useState([]); // Detailed OSRM road coordinates
  const [showTripInitModal, setShowTripInitModal] = useState(false);
  const [initModalShown, setInitModalShown] = useState(false);
  const [isTripCancelled, setIsTripCancelled] = useState(false);
  const [cancellingTrip, setCancellingTrip] = useState(false);
  const navigate = useNavigate();

  const handleToggleTripCancel = async () => {
    if (!busInfo?.bus?.id) return;
    try {
      setCancellingTrip(true);
      const token = localStorage.getItem('jwtToken');
      const repNo = busInfo.bus.currentRep || 1;
      
      if (isTripCancelled) {
        await axios.post(getApiUrl('/trips/uncancel'), {
          bus_id: busInfo.bus.id,
          rep_no: repNo
        }, { headers: { Authorization: `Bearer ${token}` } });
        setIsTripCancelled(false);
      } else {
        await axios.post(getApiUrl('/trips/cancel'), {
          bus_id: busInfo.bus.id,
          rep_no: repNo,
          reason: 'Cancelled by driver'
        }, { headers: { Authorization: `Bearer ${token}` } });
        setIsTripCancelled(true);
      }
    } catch (err) {
      console.error('Error toggling trip cancellation:', err);
    } finally {
      setCancellingTrip(false);
    }
  };

  const mapRef = useRef(null);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && (error.response.status === 401 || error.response.data?.expired)) {
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          navigate('/login');
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);

  useEffect(() => {
    const fetchDriverBus = async (isBackground = false) => {
      try {
        if (!isBackground) {
          setLoading(true);
        }

        const response = await axios.get(
          getApiUrl('/driver/my-bus'),
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
            }
          }
        );

        if (response.data && response.data.data) {
          setBusInfo(response.data.data);

          // Only show the modal on first login, not on page refreshes
          if (!initModalShown) {
            setShowTripInitModal(true);
            setInitModalShown(true);
          }
        } else {
          if (!isBackground) setError('No bus assigned to you');
        }
      } catch (error) {
        console.error('Error fetching driver bus:', error);
        if (!isBackground) setError('Failed to load your bus information');
      } finally {
        if (!isBackground) setLoading(false);
      }
    };

    fetchDriverBus(false);

    const interval = setInterval(() => fetchDriverBus(true), 60000);

    return () => clearInterval(interval);
  }, [initModalShown]);

  useEffect(() => {
    if (position && !center) {
      setCenter(position);
    }
  }, [position, center]);

  const handleStopReached = async (busId, stopId) => {
    try {
      const response = await axios.post(
        getApiUrl('/driver/clear-stop'),
        { busId, stopId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
          }
        }
      );

      if (response.data) {
        setBusInfo(prev => ({
          ...prev,
          bus: response.data.data,
          stopsCleared: parseInt(response.data.data.stops_cleared)
        }));

        const fetchDriverBus = async () => {
          try {
            const response = await axios.get(
              getApiUrl('/driver/my-bus'),
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('jwtToken')}`
                }
              }
            );

            if (response.data && response.data.data) {
              setBusInfo(response.data.data);
            }
          } catch (error) {
            console.error('Error refreshing driver bus info:', error);
          }
        };

        fetchDriverBus();
      }
    } catch (error) {
      console.error('Error auto-clearing stop:', error);
    }
  };

  const handleTripInitialized = (updatedBusInfo) => {
    // Update the bus info with the data returned from trip initialization
    setBusInfo(prevInfo => ({
      ...prevInfo,
      ...updatedBusInfo
    }));
  };

  const handleCloseTripModal = () => {
    setShowTripInitModal(false);
  };

  const [overrideNextStopIndex, setOverrideNextStopIndex] = useState(null);

  const getStopIndices = () => {
    if (!busInfo || !busInfo.route || busInfo.route.length === 0) {
      return { lastClearedStopIndex: null, nextStopIndex: null };
    }

    const stops = busInfo.route;
    const stopsCleared = busInfo.stopsCleared || 0;

    if (overrideNextStopIndex !== null) {
      return {
        lastClearedStopIndex: overrideNextStopIndex > 0 ? overrideNextStopIndex - 1 : null,
        nextStopIndex: overrideNextStopIndex
      };
    }

    if (stopsCleared === 0) {
      return {
        lastClearedStopIndex: null,
        nextStopIndex: 0
      };
    }

    return {
      lastClearedStopIndex: stopsCleared - 1,
      nextStopIndex: stopsCleared % stops.length
    };
  };

  const { lastClearedStopIndex, nextStopIndex } = getStopIndices();

  if (loading) {
    return (
      <div className="driver-map-loading">
        <div className="spinner"></div>
        <p>Loading your bus information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!busInfo || !busInfo.bus) {
    return (
      <div className="driver-map-error driver-map-container">
        <h2>No Bus Assigned</h2>
        <p>You do not have a bus assigned to you. Please contact an administrator.</p>
      </div>
    );
  }

  const handleCenterMap = (newCenter) => {
    setCenter(newCenter);
    setZoom(19); // Use maximum zoom level
    setUserZoomed(false); // Reset user zoom preference when manually centering
  };

  return (
    <div className="driver-map-screen">
      {/* Trip Initialization Modal */}
      <TripInitModal
        show={showTripInitModal}
        onClose={handleCloseTripModal}
        busInfo={busInfo}
        onTripInit={handleTripInitialized}
      />

      <div className="driver-map-container">
        <MapContainer
          center={center || [22.3190, 87.3091]}
          zoom={zoom}
          className="driver-map"
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          <MapController center={center} zoom={zoom} />

          <DriverLocationTracker setPosition={setPosition} />

          {position && (
            <KeepBusInView
              position={position}
              userZoomed={userZoomed}
              setUserZoomed={setUserZoomed}
            />
          )}

          {position && busInfo && (
            <LocationUpdater
              driverId={localStorage.getItem('userId')}
              busId={busInfo.bus.id}
              position={position}
            />
          )}

          {position && busInfo && busInfo.nextStop && (
            <ProximityDetector
              busId={busInfo.bus.id}
              position={position}
              nextStop={busInfo.nextStop}
              busInfo={busInfo}
              onStopReached={handleStopReached}
            />
          )}

          {position && (() => {
            const polylinePoints = roadPolylineCoords.length > 0 
              ? roadPolylineCoords 
              : (busInfo?.route ? busInfo.route.map(s => [parseFloat(s.latitude), parseFloat(s.longitude)]) : []);
            
            const displayCoords = polylinePoints.length >= 2 
              ? snapToRoutePolyline(position, polylinePoints) 
              : position;
              
            return (
              <Marker position={displayCoords} icon={busIcon}>
                <Popup>
                  <div className="driver-popup">
                    <strong>Your Location (Bus {busInfo.bus.name})</strong>
                    <p>Snapped to Campus Road Network</p>
                  </div>
                </Popup>
              </Marker>
            );
          })()}

          {busInfo && busInfo.route && busInfo.route.map((stop, idx) => (
            <Marker
              key={stop.id}
              position={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
              icon={idx === nextStopIndex ? nextStopIcon : busStopIcon}
            >
              <Popup>
                <div className="stop-popup">
                  <strong>{stop.name || stop.stop_name || `Stop #${idx + 1}`}</strong>
                  <p>Stop #{idx + 1} in route</p>
                  {idx === nextStopIndex && (
                    <p className="next-stop-label">This is your next stop</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {busInfo && busInfo.route && position && (
            <OsrmRoutes
              stops={busInfo.route}
              currentPosition={position}
              lastClearedStopIndex={lastClearedStopIndex}
              nextStopIndex={nextStopIndex}
              onRoutePolylineLoaded={setRoadPolylineCoords}
            />
          )}

          {position && busInfo && busInfo.nextStop && (
            <NextStopDistanceUpdater
              position={position}
              nextStop={busInfo.nextStop}
            />
          )}

          <div className="location-button-container">
            <button
              className={`location-button ${!userZoomed ? 'active' : ''}`}
              onClick={() => {
                setUserZoomed(false);
                if (position) {
                  handleCenterMap(position);
                }
              }}
              title="Center map on your live location"
            >
              <i className="fas fa-location-arrow"></i> {!userZoomed ? "Following Live Location" : "Recenter Location"}
            </button>
          </div>
        </MapContainer>

        {busInfo && busInfo.route && position && (
          <PermanentDirections
            stops={busInfo.route}
            currentPosition={position}
            lastClearedStopIndex={lastClearedStopIndex}
            nextStopIndex={nextStopIndex}
          />
        )}

        <div className="bus-info-panel">
          <h3>Bus: {busInfo.bus.name}</h3>
          {busInfo.route && (
            <div className="next-stop-info">
              <p><strong>Next Stop:</strong> {busInfo.route[nextStopIndex]?.name || busInfo.nextStop?.name}</p>
              <p><strong>Distance:</strong> <span id="next-stop-distance">Calculating...</span></p>
              
              <div className="emergency-stop-override" style={{ marginTop: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#ff4d4f' }}>🚨 Emergency Detour / Skip Stop:</label>
                <select 
                  value={nextStopIndex}
                  onChange={(e) => setOverrideNextStopIndex(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', fontSize: '13px', marginTop: '4px' }}
                >
                  {busInfo.route.map((stop, idx) => (
                    <option key={stop.id} value={idx}>
                      Stop #{idx + 1}: {stop.name} {idx === nextStopIndex ? '(Active Next)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {/* Trip reinitialization and cancellation buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              className="trip-init-button"
              onClick={() => setShowTripInitModal(true)}
              style={{ flex: 1 }}
            >
              Change Trip
            </button>
            <button
              onClick={handleToggleTripCancel}
              disabled={cancellingTrip}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: isTripCancelled ? '#52c41a' : '#ff4d4f',
                color: 'white'
              }}
            >
              {cancellingTrip ? 'Updating...' : (isTripCancelled ? '✅ Reactivate Trip' : '🚨 Cancel Trip')}
            </button>
          </div>
          {isTripCancelled && (
            <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#fff2f0', border: '1px solid #ffccc7', borderRadius: '4px', fontSize: '11px', color: '#ff4d4f', textAlign: 'center', fontWeight: 'bold' }}>
              ⚠️ Scheduled trip marked as CANCELLED today
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DriverMapScreen;
