import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import apiConfig, { getApiUrl } from '../../utils/api2.js';
import './AdminStyles.css';

import BusManagement from './buses/BusManagement.js';
import StopManagement from './buses/StopManagement.js';
import RouteManagement from './routes/RouteManagement.js';
import DriverManagement from './drivers/DriverManagement.js';
// import SystemStatistics from './SystemStatistics.js';
import UserLocations from './locations/UserLocations.js';
import UserManagement from './users/UserManagement.js';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('kgp_admin_active_tab') || 'overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('kgp_admin_sidebar_collapsed') === 'true'
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('kgp_admin_active_tab', tab);
    } catch (e) {
      console.warn("Could not save admin active tab to localStorage", e);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const nextState = !prev;
      try {
        localStorage.setItem('kgp_admin_sidebar_collapsed', String(nextState));
      } catch (e) {
        console.warn("Could not save sidebar state to localStorage", e);
      }
      return nextState;
    });
  };
  
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.role === 'admin') {
            setUser(parsedUser);
            setLoading(false);
            return;
          }
        }

        const token = localStorage.getItem('jwtToken');
        if (!token) {
          throw new Error("No authentication token found");
        }

        const response = await axios.get(`/logged_in/${id}/admin`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          withCredentials: true
        });

        if (response.data && response.data.user) {
          const userData = response.data.user;
          userData.token = token;
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
        } else {
          throw new Error("Invalid user data received");
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        setError("Failed to load admin dashboard. Please log in again.");
        
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          setTimeout(() => navigate('/login'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [id, navigate]);


  // Show loading state
  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  // Show error message
  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/login')}>Return to Login</button>
      </div>
    );
  }

  // Show unauthorized message if user is not an admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="unauthorized">
        <h2>Unauthorized Access</h2>
        <p>You must be an administrator to access this page.</p>
        <button onClick={() => navigate('/login')}>Go to Login</button>
      </div>
    );
  }
  
  // Get token for API calls
  const token = localStorage.getItem('jwtToken');
  
  // Debug token format to help diagnose issues
  ////console.log("Token format check:", {
  //   exists: !!token,
  //   length: token ? token.length : 0,
  //   // Show only first 10 chars to avoid logging sensitive data
  //   preview: token ? token.substring(0, 10) + '...' : null
  // });

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'buses':
        return <BusManagement user={{...user, token}} />;
      case 'stops':
        return <StopManagement user={{...user, token}} />;
      case 'routes':
        return <RouteManagement user={{...user, token}} />;
      case 'drivers':
        return <DriverManagement user={{...user, token}} />;
      case 'users':
        return <UserManagement user={{...user, token}} />;
      case 'locations':
        return <UserLocations user={{...user, token}} />;
      default:
        return <AdminOverview 
                  user={{...user, token}} 
                  setActiveTab={handleTabChange} 
               />;
    }
  };

  return (
    <div className={`admin-dashboard ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Standard 3-line Hamburger button to open sidebar when collapsed */}
      {isSidebarCollapsed && (
        <button 
          className="sidebar-hamburger-open-btn" 
          onClick={toggleSidebar}
          title="Open Admin Menu"
          aria-label="Open Admin Menu"
        >
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
        </button>
      )}

      <div className="admin-container">
        <div className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-top-header">
            <span className="sidebar-title font-semibold">Admin Navigation</span>
            <button 
              className="sidebar-close-x-btn" 
              onClick={toggleSidebar}
              title="Close Sidebar"
              aria-label="Close Sidebar"
            >
              ✕
            </button>
          </div>
          <nav>
            <ul>
              <li 
                className={activeTab === 'overview' ? 'active' : ''} 
                onClick={() => handleTabChange('overview')}
                title="Dashboard Overview">
                  <span className="nav-text">Dashboard Overview</span>
              </li>
              <li 
                className={activeTab === 'buses' ? 'active' : ''} 
                onClick={() => handleTabChange('buses')}
                title="Manage Buses">
                  <span className="nav-text">Manage Buses</span>
              </li>
              <li 
                className={activeTab === 'stops' ? 'active' : ''} 
                onClick={() => handleTabChange('stops')}
                title="Manage Bus Stops">
                  <span className="nav-text">Manage Bus Stops</span>
              </li>
              <li 
                className={activeTab === 'routes' ? 'active' : ''} 
                onClick={() => handleTabChange('routes')}
                title="Manage Routes">
                  <span className="nav-text">Manage Routes</span>
              </li>
              <li 
                className={activeTab === 'drivers' ? 'active' : ''} 
                onClick={() => handleTabChange('drivers')}
                title="Manage Drivers">
                  <span className="nav-text">Manage Drivers</span>
              </li>
              <li 
                className={activeTab === 'users' ? 'active' : ''} 
                onClick={() => handleTabChange('users')}
                title="Manage Users">
                  <span className="nav-text">Manage Users</span>
              </li>
              <li 
                className={activeTab === 'locations' ? 'active' : ''} 
                onClick={() => handleTabChange('locations')}
                title="Track User Locations">
                  <span className="nav-text">Track User Locations</span>
              </li>
            </ul>
          </nav>
        </div>
        
        <div className="admin-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// Simple overview component for the dashboard home
function AdminOverview({ user, setActiveTab }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBuses: 0,
    totalStops: 0,
    totalRoutes: 0,
    totalDrivers: 0
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // Get token from user object or localStorage
        const token = user.token || localStorage.getItem('jwtToken');
        
        const response = await axios.get(
          getApiUrl(apiConfig.endpoints.adminStats),
          { 
            headers: { 'Authorization': `Bearer ${token}` },
            withCredentials: true
          }
        );
        
        if (response.data) {
          setStats({
            totalUsers: response.data.totalUsers || 0,
            totalBuses: response.data.totalBuses || 0,
            totalStops: response.data.totalStops || 0,
            totalRoutes: response.data.totalRoutes || 0,
            totalDrivers: response.data.totalDrivers || 0,
          });
        }
      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
        // Fallback to demo values
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, [user.token]);
  
  if (loading && !stats.totalUsers && !stats.totalBuses) {
    return (
      <div className="admin-overview">
        <h2>System Overview</h2>
        <div className="loading-indicator">Loading system statistics...</div>
      </div>
    );
  }


  return (
    <div className="admin-overview">
      <h2>System Overview</h2>
      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Buses</h3>
          <div className="stat">{stats.totalBuses}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('buses')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Bus Stops</h3>
          <div className="stat">{stats.totalStops}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('stops')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Routes</h3>
          <div className="stat">{stats.totalRoutes}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('routes')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Drivers</h3>
          <div className="stat">{stats.totalDrivers}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('drivers')}>Manage</button>
          </div>
        </div>
        <div className="stat-card">
          <h3>Users</h3>
          <div className="stat">{stats.totalUsers}</div>
          <div className="stat-action">
            <button onClick={() => setActiveTab('users')}>Manage</button>
          </div>
        </div>
      </div>
      
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button onClick={() => setActiveTab('buses')}>Add New Bus</button>
          <button onClick={() => setActiveTab('stops')}>Add New Stop</button>
          <button onClick={() => setActiveTab('routes')}>Create New Route</button>
          <button onClick={() => setActiveTab('drivers')}>Add New Driver</button>
          <button onClick={() => setActiveTab('users')}>Manage Users</button>
        </div>
      </div>
      
      {/* <div className="recent-activity">
        <h3>Recent System Activity</h3>
        <ul className="activity-list">
          <li>Bus KGP Express 1 location updated (2 minutes ago)</li>
          <li>New student registered: Aditya Gupta (15 minutes ago)</li>
          <li>Route modification: Campus Shuttle 2 (1 hour ago)</li>
          <li>System maintenance completed (3 hours ago)</li>
        </ul>
      </div> */}
    </div>
  );
}

export default AdminDashboard;
