import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api, { getApiUrl } from '../../../utils/api2.js';
import BusTracking from '../../user/bus_tracker/BusTracking.js';
import '../AdminStyles.css';

axios.defaults.withCredentials = true;

function BusManagement({ user }) {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBus, setEditingBus] = useState(null);
  const [formData, setFormData] = useState({ 
    name: ''
  });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal States
  const [selectedBusForTrips, setSelectedBusForTrips] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState('');
  const [activeScheduleTab, setActiveScheduleTab] = useState(0);
  const [cancelReasons, setCancelReasons] = useState({});

  const [selectedBusForTrack, setSelectedBusForTrack] = useState(null);
  
  // Define fetch buses function
  const fetchBuses = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await axios.get(getApiUrl(api.endpoints.adminBuses), {
        headers: { Authorization: `Bearer ${user.token}` },
        timeout: 10000 // 10 second timeout
      });
      
      if (response.data && Array.isArray(response.data)) {
        setBuses(response.data);
        //console.log("Buses loaded from database:", response.data.length);
      } else {
        throw new Error("Invalid data format received");
      }
    } catch (err) {
      console.error("Error in fetchBuses:", err);
      
      // Provide more user-friendly message based on error type
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        setError('Request timed out. The server might be overloaded or the database is temporarily unavailable.');
      } else if (err.code === 'ETIMEDOUT') {
        setError('Connection to database timed out. Please try again later.');
      } else {
        setError('Failed to fetch buses: ' + err.message);
      }
      
      // Add fallback mock data if needed
      if (buses.length === 0) {
        setBuses([
          { id: 'mock1', name: 'Demo Bus 1', created_at: new Date().toISOString() },
          { id: 'mock2', name: 'Demo Bus 2', created_at: new Date().toISOString() }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    //console.log("Fetching buses (useEffect triggered)");
    fetchBuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.token, refreshTrigger]); 

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      //console.log("Adding new bus:", formData);
      
      const response = await axios.post(
        getApiUrl(api.endpoints.adminAddBus),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      
      if (response.data) {
        //console.log("Bus added successfully:", response.data);
        // Refresh to get latest data from server
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      // Reset form state
      setFormData({ name: '' });
      setIsAddingNew(false);
    } catch (err) {
      setError('Failed to add bus: ' + err.message);
      console.error("Error in handleAddBus:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditBus = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      //console.log("Updating bus:", editingBus.id, formData);
      
      const response = await axios.put(
        getApiUrl(api.endpoints.adminUpdateBus(editingBus.id)),
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      
      if (response.data) {
        //console.log("Bus updated successfully:", response.data);
        // Refresh to get latest data from server
        setRefreshTrigger(prev => prev + 1);
      } else {
        throw new Error("No data returned");
      }
      
      setEditingBus(null);
      setFormData({ name: '' });
    } catch (err) {
      setError('Failed to update bus: ' + err.message);
      console.error("Error in handleEditBus:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBus = async (id) => {
    // Improved confirmation message with warning about related data
    if (!window.confirm('Are you sure you want to delete this bus? This will also remove all related data including routes, start times, driver assignments, and location history.')) return;
    
    try {
        setError('');
        setLoading(true);
        console.log("Deleting bus:", id);
        
        const response = await axios.delete(
            getApiUrl(api.endpoints.adminDeleteBus(id)),
            { headers: { Authorization: `Bearer ${user.token}` } }
        );
        
        console.log("Bus deletion response:", response.data);
        
        // Show success message
        const successMessage = response.data.message || 'Bus deleted successfully';
        alert(successMessage);
        
        // Refresh to get latest data
        setRefreshTrigger(prev => prev + 1);
    } catch (err) {
        console.error("Error in handleDeleteBus:", err);
        
        let errorMessage = "Failed to delete bus";
        
        // Check for foreign key constraint violation
        if (err.response?.data?.message?.includes('foreign key constraint')) {
            errorMessage = "Cannot delete this bus because it has related schedules or routes. Please delete those first.";
        } else if (err.response?.data?.message) {
            // Use the server's error message if available
            errorMessage = err.response.data.message;
        } else {
            // Fall back to generic error with the message
            errorMessage = 'Failed to delete bus: ' + err.message;
        }
        
        setError(errorMessage);
        alert(errorMessage); // Show an alert for immediate feedback
    } finally {
        setLoading(false);
    }
  };

  const startEditing = (bus) => {
    setEditingBus(bus);
    setFormData({ name: bus.name });
    setIsAddingNew(false);
  };

  const cancelAction = () => {
    setEditingBus(null);
    setFormData({ name: '' });
    setIsAddingNew(false);
  };

  // Trips Modal Handlers
  const openTripsModal = async (bus) => {
    setSelectedBusForTrips(bus);
    setTripsLoading(true);
    setTripsError('');
    setCancelReasons({});
    try {
      const response = await axios.get(
        getApiUrl(api.endpoints.adminBusSchedule(bus.id)),
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setScheduleData(response.data);
      setActiveScheduleTab(0);
    } catch (err) {
      console.error('Error fetching bus schedule:', err);
      setTripsError('Failed to fetch schedule: ' + (err.response?.data?.message || err.message));
    } finally {
      setTripsLoading(false);
    }
  };

  const handleToggleCancelTrip = async (dateStr, trip) => {
    if (!selectedBusForTrips) return;
    const busId = selectedBusForTrips.id;
    const isCancelling = !trip.is_cancelled;
    const customReason = cancelReasons[`${dateStr}_${trip.rep_no}`];
    const reason = isCancelling ? (customReason && customReason.trim() ? customReason : 'Cancelled by Admin') : null;

    // Optimistic UI update
    setScheduleData(prev => {
      if (!prev || !prev.schedule) return prev;
      const updatedSchedule = prev.schedule.map(day => {
        if (day.date !== dateStr) return day;
        return {
          ...day,
          trips: day.trips.map(t => {
            if (t.rep_no !== trip.rep_no) return t;
            return {
              ...t,
              is_cancelled: isCancelling,
              cancel_reason: isCancelling ? reason : null
            };
          })
        };
      });
      return { ...prev, schedule: updatedSchedule };
    });

    try {
      if (isCancelling) {
        await axios.post(
          getApiUrl(api.endpoints.cancelTrip),
          {
            bus_id: busId,
            rep_no: trip.rep_no,
            start_time: trip.start_time,
            trip_date: dateStr,
            reason: reason
          },
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
      } else {
        await axios.post(
          getApiUrl(api.endpoints.uncancelTrip),
          {
            bus_id: busId,
            rep_no: trip.rep_no,
            start_time: trip.start_time,
            trip_date: dateStr
          },
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
      }
    } catch (err) {
      console.error('Error toggling trip cancellation:', err);
      alert('Failed to update trip status: ' + (err.response?.data?.message || err.message));
      openTripsModal(selectedBusForTrips);
    }
  };

  // Track Modal Handler
  const openTrackModal = (bus) => {
    setSelectedBusForTrack(bus);
  };

  if (loading && !buses.length) return <div>Loading buses...</div>;

  return (
    <div className="bus-management">
      <h2>Bus Management</h2>
      {error && <div className="error-message">{error}</div>}
      
      <div className="action-buttons">
        <button 
          className="add-button"
          onClick={() => {
            setIsAddingNew(true);
            setEditingBus(null);
            setFormData({ name: '' });
          }}
          disabled={isAddingNew || editingBus}
        >
          Add New Bus
        </button>
        
        <button 
          onClick={() => setRefreshTrigger(prev => prev + 1)}
          disabled={loading}
          className="refresh-button"
        >
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>
      
      {isAddingNew && (
        <div className="form-container">
          <h3>Add New Bus</h3>
          <form onSubmit={handleAddBus}>
            <div className="form-group">
              <label htmlFor="name">Bus Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-buttons">
              <button type="submit">Add Bus</button>
              <button type="button" onClick={cancelAction}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      {editingBus && (
        <div className="form-container">
          <h3>Edit Bus</h3>
          <form onSubmit={handleEditBus}>
            <div className="form-group">
              <label htmlFor="name">Bus Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-buttons">
              <button type="submit">Update Bus</button>
              <button type="button" onClick={cancelAction}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      
      <div className="bus-list">
        <h3>Current Buses</h3>
        {buses.length === 0 ? (
          <p>No buses found in the system.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(bus => (
                <tr key={bus.id}>
                  <td>{bus.id}</td>
                  <td>{bus.name}</td>
                  <td>{new Date(bus.created_at).toLocaleString()}</td>
                  <td>
                    <div className="action-btn-group">
                      <button className="btn-action-edit" onClick={() => startEditing(bus)}>Edit</button>
                      <button className="btn-action-trips" onClick={() => openTripsModal(bus)}>Trips</button>
                      <button className="btn-action-track" onClick={() => openTrackModal(bus)}>Track</button>
                      <button className="btn-action-delete" onClick={() => handleDeleteBus(bus.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trips Modal Popup */}
      {selectedBusForTrips && (
        <div className="admin-modal-overlay" onClick={() => setSelectedBusForTrips(null)}>
          <div className="admin-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>🚍 Manage Trips Schedule: {selectedBusForTrips.name} (ID: {selectedBusForTrips.id})</h3>
              <button className="admin-modal-close-btn" onClick={() => setSelectedBusForTrips(null)}>✕</button>
            </div>
            <div className="admin-modal-body">
              {tripsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading trip schedule...</div>
              ) : tripsError ? (
                <div className="error-message">{tripsError}</div>
              ) : scheduleData && scheduleData.schedule ? (
                <div>
                  <div style={{ marginBottom: '1rem', color: '#64748b' }}>
                    <strong>Route:</strong> {scheduleData.origin} ➔ {scheduleData.destination} ({scheduleData.totalStops} stops)
                  </div>

                  {/* 7-Day Schedule Tabs */}
                  <div className="trips-schedule-tabs">
                    {scheduleData.schedule.map((day, idx) => (
                      <button
                        key={day.date}
                        className={`trip-tab-btn ${activeScheduleTab === idx ? 'active' : ''}`}
                        onClick={() => setActiveScheduleTab(idx)}
                      >
                        {day.dayName}
                        {day.trips.some(t => t.is_cancelled) && (
                          <span style={{ marginLeft: '5px', color: '#ef4444' }}>●</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Day Trips Content */}
                  {scheduleData.schedule[activeScheduleTab] && (
                    <div>
                      <h4>
                        Schedule for {scheduleData.schedule[activeScheduleTab].dayName} ({scheduleData.schedule[activeScheduleTab].date})
                      </h4>
                      {scheduleData.schedule[activeScheduleTab].trips.length === 0 ? (
                        <p style={{ color: '#64748b' }}>No scheduled start times set for this bus.</p>
                      ) : (
                        <div className="day-trips-grid">
                          {scheduleData.schedule[activeScheduleTab].trips.map(trip => {
                            const dateStr = scheduleData.schedule[activeScheduleTab].date;
                            const key = `${dateStr}_${trip.rep_no}`;
                            return (
                              <div
                                key={trip.rep_no}
                                className={`trip-card ${trip.is_cancelled ? 'cancelled' : 'active-trip'}`}
                              >
                                <div className="trip-card-header">
                                  <span className="trip-rep">Trip #{trip.rep_no}</span>
                                  <span className={`trip-badge ${trip.is_cancelled ? 'cancelled' : 'active'}`}>
                                    {trip.is_cancelled ? 'CANCELLED' : 'ACTIVE'}
                                  </span>
                                </div>
                                <div className="trip-time">⏰ {trip.start_time}</div>
                                {trip.is_cancelled && trip.cancel_reason && (
                                  <div className="cancel-reason-text">
                                    Reason: {trip.cancel_reason}
                                  </div>
                                )}
                                {!trip.is_cancelled && (
                                  <div className="reason-input-group">
                                    <input
                                      type="text"
                                      placeholder="Cancellation reason (optional)..."
                                      value={cancelReasons[key] || ''}
                                      onChange={(e) => setCancelReasons({ ...cancelReasons, [key]: e.target.value })}
                                    />
                                  </div>
                                )}
                                <button
                                  className={`btn-trips-action ${trip.is_cancelled ? 'uncancel' : 'cancel'}`}
                                  onClick={() => handleToggleCancelTrip(dateStr, trip)}
                                >
                                  {trip.is_cancelled ? 'Reactivate Trip' : 'Cancel Trip'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>No schedule data found for this bus.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Track Modal Popup */}
      {selectedBusForTrack && (
        <div className="admin-modal-overlay" onClick={() => setSelectedBusForTrack(null)}>
          <div className="admin-modal-container large-tracking" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>📍 Live Track Bus: {selectedBusForTrack.name} (ID: {selectedBusForTrack.id})</h3>
              <button className="admin-modal-close-btn" onClick={() => setSelectedBusForTrack(null)}>✕</button>
            </div>
            <div className="admin-modal-body" style={{ padding: 0 }}>
              <div className="modal-track-wrapper">
                <BusTracking selectedBus={selectedBusForTrack} hideDropdown={true} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BusManagement;
