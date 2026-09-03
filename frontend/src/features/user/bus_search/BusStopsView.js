import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';
import BusTracking from '../bus_tracker/BusTracking';
import '../user.css';
import './SearchBus.css';

const BusStopsView = ({ userLocation, setUserLocation }) => {
  const [busStops, setBusStops] = useState([]);
  const [fromStop, setFromStop] = useState('');
  const [fromStopId, setFromStopId] = useState('');
  const [toStop, setToStop] = useState('');
  const [toStopId, setToStopId] = useState('');
  
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchingBuses, setSearchingBuses] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // State for live tracking popup modal
  const [trackingBus, setTrackingBus] = useState(null);

  // Fetch all bus stops on mount
  useEffect(() => {
    const loadStops = async () => {
      try {
        setLoading(true);
        const res = await api.get('/bus_stops/getAllBusStops');
        if (res.data && res.data.data) {
          setBusStops(res.data.data);
        }
      } catch (err) {
        console.error("Failed to load bus stops:", err);
        setErrorMessage("Failed to load bus stops. Please refresh.");
      } finally {
        setLoading(false);
      }
    };
    loadStops();
  }, []);

  const filteredFromStops = busStops.filter(stop =>
    stop.name.toLowerCase().includes(fromStop.toLowerCase())
  );

  const filteredToStops = busStops.filter(stop =>
    stop.name.toLowerCase().includes(toStop.toLowerCase())
  );

  const handleFromStopSelect = (stop) => {
    setFromStop(stop.name);
    setFromStopId(stop.id);
    setFromDropdownOpen(false);
  };

  const handleToStopSelect = (stop) => {
    setToStop(stop.name);
    setToStopId(stop.id);
    setToDropdownOpen(false);
  };

  const handleSearch = async () => {
    if (!fromStopId || !toStopId) {
      setErrorMessage("Please select both starting and destination stops");
      return;
    }
    if (fromStopId === toStopId) {
      setErrorMessage("From and To stops cannot be the same");
      return;
    }

    try {
      setSearchingBuses(true);
      setErrorMessage(null);
      
      let res;
      try {
        res = await api.get('/bus_stops/getBusesByStops', {
          params: { fromStopId, toStopId }
        });
      } catch (firstErr) {
        res = await api.get('/busStopsView/buses', {
          params: { fromStopId, toStopId }
        });
      }

      if (res.data && res.data.data) {
        setBuses(res.data.data);
      } else {
        setBuses([]);
      }
      setSearchPerformed(true);
    } catch (err) {
      console.error("Error searching buses:", err);
      if (err.response && err.response.status === 404) {
        setBuses([]);
        setSearchPerformed(true);
      } else {
        setErrorMessage("Failed to find buses. Please try again.");
      }
    } finally {
      setSearchingBuses(false);
    }
  };

  const handleResetSearch = () => {
    setFromStop('');
    setFromStopId('');
    setToStop('');
    setToStopId('');
    setBuses([]);
    setSearchPerformed(false);
    setErrorMessage(null);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  return (
    <div className="bus-stops-view">
      <div className="control-panel">
        <h2>Search Buses by Route</h2>

        {/* From Stop Selection */}
        <div className="form-group">
          <label htmlFor="fromStop">From Bus Stop</label>
          <div className="dropdown-input-container">
            <input
              type="text"
              id="fromStop"
              placeholder="Select origin stop..."
              value={fromStop}
              onChange={(e) => {
                setFromStop(e.target.value);
                setFromStopId('');
              }}
              onFocus={() => setFromDropdownOpen(true)}
              onBlur={() => setTimeout(() => setFromDropdownOpen(false), 200)}
            />
            <button
              type="button"
              className="dropdown-toggle-btn"
              onClick={() => setFromDropdownOpen(!fromDropdownOpen)}
            >
              ▼
            </button>
          </div>

          {fromDropdownOpen && (
            <ul className="dropdown-list">
              {filteredFromStops.length > 0 ? (
                filteredFromStops.map(stop => (
                  <li key={stop.id} onMouseDown={() => handleFromStopSelect(stop)}>
                    {stop.name}
                  </li>
                ))
              ) : (
                <li className="loading-item">No matching stops found</li>
              )}
            </ul>
          )}
        </div>

        {/* To Stop Selection */}
        <div className="form-group">
          <label htmlFor="toStop">To Bus Stop</label>
          <div className="dropdown-input-container">
            <input
              type="text"
              id="toStop"
              placeholder="Select destination stop..."
              value={toStop}
              onChange={(e) => {
                setToStop(e.target.value);
                setToStopId('');
              }}
              onFocus={() => setToDropdownOpen(true)}
              onBlur={() => setTimeout(() => setToDropdownOpen(false), 200)}
            />
            <button
              type="button"
              className="dropdown-toggle-btn"
              onClick={() => setToDropdownOpen(!toDropdownOpen)}
            >
              ▼
            </button>
          </div>

          {toDropdownOpen && (
            <ul className="dropdown-list">
              {filteredToStops.length > 0 ? (
                filteredToStops.map(stop => (
                  <li key={stop.id} onMouseDown={() => handleToStopSelect(stop)}>
                    {stop.name}
                  </li>
                ))
              ) : (
                <li className="loading-item">No matching stops found</li>
              )}
            </ul>
          )}
        </div>

        {errorMessage && (
          <div className="error-message">{errorMessage}</div>
        )}

        <button
          className="search-btn"
          onClick={handleSearch}
          disabled={!fromStopId || !toStopId || searchingBuses}
        >
          {searchingBuses ? 'Searching Buses...' : 'Find Available Buses'}
        </button>

        {searchPerformed && (
          <button
            className="search-btn"
            onClick={handleResetSearch}
            style={{ marginTop: '10px', backgroundColor: '#555' }}
          >
            Reset Search
          </button>
        )}
      </div>

      <div className="results-panel">
        {loading || searchingBuses ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>{searchingBuses ? 'Searching available buses...' : 'Loading bus stops...'}</p>
          </div>
        ) : searchPerformed ? (
          buses.length > 0 ? (
            <>
              <h2>Available Buses ({buses.length})</h2>
              <div className="bus-list">
                {buses.map((bus, index) => (
                  <div className="bus-card" key={bus.displayId || `${bus.id}-${index}`}>
                    <div className="bus-header">
                      <h3>{bus.name}</h3>
                      <span className={`trip-badge ${bus.is_cancelled ? 'cancelled' : ''}`}>
                        {bus.is_cancelled ? 'CANCELLED' : `Trip ${bus.currentTrip}/${bus.totalTrips}`}
                      </span>
                    </div>

                    <div className="bus-route">
                      <div className="route-stop">
                        <div className="stop-time">{formatTime(bus.times?.departureTime)}</div>
                        <div className="stop-name">{bus.route?.fromStop?.name}</div>
                      </div>

                      <div className="route-line">
                        <span className="duration">{bus.times?.durationMinutes || '--'} min</span>
                      </div>

                      <div className="route-stop">
                        <div className="stop-time">{formatTime(bus.times?.arrivalTime)}</div>
                        <div className="stop-name">{bus.route?.toStop?.name}</div>
                      </div>
                    </div>

                    <div className="bus-info">
                      <div className="bus-detail">
                        <span>Start Time: {formatTime(bus.times?.busStart)}</span>
                      </div>
                      {bus.is_cancelled && (
                        <div className="bus-detail cancelled-reason" style={{ color: '#ff6b6b' }}>
                          <span>Reason: {bus.cancelled_reason || 'Trip cancelled by admin'}</span>
                        </div>
                      )}
                    </div>

                    <div className="bus-actions">
                      <button 
                        className="track-bus-btn" 
                        onClick={() => setTrackingBus(bus)}
                      >
                        <i className="fas fa-location-arrow"></i> Track Bus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="no-results">
              <p>No buses found for this route segment. Please try selecting different stops.</p>
            </div>
          )
        ) : (
          <div className="help-text-container">
            <div className="help-text bus-selection-help center-text">
              <span>Select your starting stop and destination stop above to find direct buses traveling between them.</span>
            </div>
          </div>
        )}
      </div>

      {/* Live Track Modal Popup */}
      {trackingBus && (
        <div className="tracking-overlay" onClick={() => setTrackingBus(null)}>
          <div className="tracking-popup-container" onClick={(e) => e.stopPropagation()}>
            <button 
              className="tracking-popup-close-btn" 
              onClick={() => setTrackingBus(null)}
              title="Close tracking popup"
            >
              ✕
            </button>
            <div style={{ height: '100%', width: '100%' }}>
              <BusTracking 
                selectedBus={trackingBus} 
                hideDropdown={true} 
                userLocation={userLocation} 
                setUserLocation={setUserLocation} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusStopsView;
