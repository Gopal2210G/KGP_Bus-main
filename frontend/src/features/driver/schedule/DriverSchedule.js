import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiConfig, { getApiUrl } from '../../../utils/api2.js';
import '../DriverPage.css';

function DriverSchedule() {
  const userId = localStorage.getItem('userId') || 'driver';
  const CACHE_KEY = `kgp_driver_schedule_cache_${userId}`;

  // Initialize scheduleData directly from localStorage if available for 0ms load time
  const [scheduleData, setScheduleData] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const [loading, setLoading] = useState(!scheduleData);
  const [error, setError] = useState(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchSchedule = async (isBackground = false) => {
    try {
      if (!isBackground && !scheduleData) {
        setLoading(true);
      }

      const token = localStorage.getItem('jwtToken');
      if (!token) {
        if (!isBackground) setError('Authentication token missing');
        setLoading(false);
        return;
      }

      const response = await axios.get(
        getApiUrl(apiConfig.endpoints.driverSchedule || '/driver/schedule'),
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );

      if (response.data && response.data.data) {
        const newData = response.data.data;
        setScheduleData(newData);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(newData));
        } catch (e) {
          console.warn('Failed to cache schedule data', e);
        }
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching driver schedule:', err);
      if (!isBackground && !scheduleData) {
        setError(err.response?.data?.message || 'Failed to load schedule');
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    // If cached data exists, fetch silently in background; otherwise show loader
    fetchSchedule(Boolean(scheduleData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleCancel = async (trip, tripDate) => {
    if (!scheduleData?.bus) return;

    const actionKey = `${tripDate}_${trip.rep_no}`;
    setActionLoading(actionKey);

    const targetCancelledState = !trip.is_cancelled;

    // Optimistic UI Update: Toggle state instantly in React state & localStorage
    setScheduleData(prevData => {
      if (!prevData) return prevData;
      const updatedSchedule = prevData.schedule.map(day => {
        if (day.date === tripDate) {
          const updatedTrips = day.trips.map(t => {
            if (t.rep_no === trip.rep_no) {
              return {
                ...t,
                is_cancelled: targetCancelledState,
                cancel_reason: targetCancelledState ? 'Cancelled by assigned bus driver' : null
              };
            }
            return t;
          });
          return { ...day, trips: updatedTrips };
        }
        return day;
      });

      const updatedData = { ...prevData, schedule: updatedSchedule };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updatedData));
      } catch (e) {}
      return updatedData;
    });

    try {
      const token = localStorage.getItem('jwtToken');
      const busId = scheduleData.bus.id;

      if (!targetCancelledState) {
        // Uncancel trip
        await axios.post(
          getApiUrl(apiConfig.endpoints.uncancelTrip || '/trips/uncancel'),
          {
            bus_id: busId,
            rep_no: trip.rep_no,
            trip_date: tripDate,
            start_time: trip.start_time
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          }
        );
      } else {
        // Cancel trip
        await axios.post(
          getApiUrl(apiConfig.endpoints.cancelTrip || '/trips/cancel'),
          {
            bus_id: busId,
            rep_no: trip.rep_no,
            trip_date: tripDate,
            start_time: trip.start_time,
            reason: 'Cancelled by assigned bus driver'
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          }
        );
      }

      // Revalidate silently in background to sync with server
      fetchSchedule(true);
    } catch (err) {
      console.error('Error toggling trip status:', err);
      alert(err.response?.data?.message || 'Failed to update trip status');
      // Revert optimistic update on failure by re-fetching
      fetchSchedule(false);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !scheduleData) {
    return <div className="schedule-loading">Loading 7-Day Schedule...</div>;
  }

  if (error) {
    return (
      <div className="schedule-error">
        <p>{error}</p>
        <button onClick={fetchSchedule}>Retry</button>
      </div>
    );
  }

  if (!scheduleData || !scheduleData.bus) {
    return (
      <div className="no-bus-assigned">
        <h3>No Bus Assigned</h3>
        <p>You currently do not have a bus assigned to your account. Please contact an administrator.</p>
      </div>
    );
  }

  const { bus, origin, destination, totalStops, schedule } = scheduleData;
  const currentDaySchedule = schedule[selectedDateIndex] || schedule[0];

  return (
    <div className="driver-schedule-container">
      <div className="schedule-header-card">
        <div className="bus-title-row">
          <h2>🚌 {bus.name}</h2>
          <span className="stops-badge">{totalStops} Stops</span>
        </div>
        <p className="route-path">
          <strong>Route:</strong> {origin} ➔ {destination}
        </p>
      </div>

      {/* 7-Day Date Selector Pills */}
      <div className="date-picker-scroll">
        {schedule.map((dayItem, index) => {
          const isSelected = index === selectedDateIndex;
          const hasCancelledTrips = dayItem.trips.some(t => t.is_cancelled);

          return (
            <button
              key={dayItem.date}
              className={`date-pill ${isSelected ? 'active' : ''} ${hasCancelledTrips ? 'has-cancellations' : ''}`}
              onClick={() => setSelectedDateIndex(index)}
            >
              <span className="day-name">{dayItem.dayName}</span>
              <span className="day-date">{dayItem.date.split('-').slice(1).join('/')}</span>
              {hasCancelledTrips && <span className="pill-dot" title="Contains cancelled trip"></span>}
            </button>
          );
        })}
      </div>

      {/* Selected Day's Scheduled Trips List */}
      <div className="day-schedule-section">
        <h3>Rides for {currentDaySchedule.dayName} ({currentDaySchedule.date})</h3>

        {currentDaySchedule.trips.length === 0 ? (
          <div className="empty-schedule">No scheduled start times configured for this bus.</div>
        ) : (
          <div className="trips-grid">
            {currentDaySchedule.trips.map((trip) => {
              const actionKey = `${currentDaySchedule.date}_${trip.rep_no}`;
              const isBusy = actionLoading === actionKey;

              return (
                <div key={trip.rep_no} className={`trip-card ${trip.is_cancelled ? 'cancelled' : 'active'}`}>
                  <div className="trip-card-header">
                    <div className="trip-time">
                      <i className="far fa-clock"></i> Departure: {trip.start_time}
                    </div>
                    <span className="rep-badge">Rep #{trip.rep_no}</span>
                  </div>

                  <div className="trip-status-row">
                    <span className={`status-tag ${trip.is_cancelled ? 'cancelled-tag' : 'active-tag'}`}>
                      {trip.is_cancelled ? '🚫 CANCELLED BY YOU' : '✅ SCHEDULED / ACTIVE'}
                    </span>

                    <button
                      className={`cancel-action-btn ${trip.is_cancelled ? 'reactivate-btn' : 'cancel-btn'}`}
                      onClick={() => handleToggleCancel(trip, currentDaySchedule.date)}
                      disabled={isBusy}
                    >
                      {isBusy ? (
                        'Updating...'
                      ) : trip.is_cancelled ? (
                        'Reactivate Ride'
                      ) : (
                        'Cancel My Ride'
                      )}
                    </button>
                  </div>

                  {trip.is_cancelled && trip.cancel_reason && (
                    <div className="cancel-note">
                      <small>Reason: {trip.cancel_reason}</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverSchedule;
