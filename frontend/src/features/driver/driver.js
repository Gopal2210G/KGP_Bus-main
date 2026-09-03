import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DriverMapScreen from './map/DriverMapScreen';
import DriverSchedule from './schedule/DriverSchedule';
import './DriverPage.css';

function Driver() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('kgp_driver_active_tab') || 'live'
  );
  const navigate = useNavigate();

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('kgp_driver_active_tab', tab);
    } catch (e) {
      console.warn('Could not save active driver tab to localStorage', e);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('jwtToken');

    if (!token) {
      navigate('/login');
      return;
    }

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser({ ...parsedUser, token });
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('jwtToken');
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [id, navigate]);

  if (!user) {
    return <div className="loading-container">Loading...</div>;
  }

  return (
    <div className="driver-page">
      {/* 2-Tab Navigation Bar */}
      <div className="driver-tab-bar">
        <button
          className={`driver-nav-tab ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => handleTabChange('live')}
        >
          📍 Current / Live Ride
        </button>
        <button
          className={`driver-nav-tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => handleTabChange('schedule')}
        >
          📅 7-Day Schedule
        </button>
      </div>

      {/* Tab Content Area */}
      <div className={`driver-tab-content ${activeTab}-active`}>
        <div style={{ display: activeTab === 'live' ? 'block' : 'none', height: '100%' }}>
          <DriverMapScreen />
        </div>
        <div style={{ display: activeTab === 'schedule' ? 'block' : 'none', height: '100%' }}>
          <DriverSchedule />
        </div>
      </div>
    </div>
  );
}

export default Driver;