import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './features/auth/authStyles.css';

import Home from './features/common/Home';
import Header from './features/common/Header';
import Footer from './features/common/Footer';
import Login from './features/auth/login';
import Register from './features/auth/signup';
import Driver from './features/driver/driver';
import User from './features/user/user';
import About from './features/common/About';
import AdminDashboard from './features/admin/AdminDashboard';
import UserProfile from './features/profile/UserProfile';
import { NotificationToast } from './features/common/NotificationToast';
import api from './utils/api';

// Future flags configuration for React Router
const router = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('jwtToken'));
  const [userRole, setUserRole] = useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { return JSON.parse(storedUser).role; } catch (e) { return null; }
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem('jwtToken');
    const storedUser = localStorage.getItem('user');
    return !token || !storedUser;
  });

  useEffect(() => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed && parsed.role) {
          setIsAuthenticated(true);
          setUserRole(parsed.role);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Fallback to API check
      }
    }

    const verifyAuth = async () => {
      try {
        const response = await api.get('/authenticate');
        if (response.status === 200 && response.data.user) {
          setIsAuthenticated(true);
          setUserRole(response.data.user.role);
          localStorage.setItem('user', JSON.stringify(response.data.user));
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        setIsAuthenticated(false);
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { return JSON.parse(storedUser); } catch (e) { return null; }
    }
    return null;
  });

  useEffect(() => {
    const token = localStorage.getItem('jwtToken');
    if (token && !user) {
      api.get('/authenticate')
        .then(response => {
          if (response.status === 200 && response.data.user) {
            setUser(response.data.user);
            localStorage.setItem('user', JSON.stringify(response.data.user));
          }
        })
        .catch(() => {
          localStorage.removeItem('jwtToken');
          localStorage.removeItem('user');
          setUser(null);
        });
    }
  }, [user]);


  const updateUser = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  return (
    <Router {...router}>
      <NotificationToast />
      <Header user={user} updateUser={updateUser} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login setUser={updateUser} />} />
        <Route path="/signup" element={<Register setUser={updateUser} />} />
        <Route path="/about" element={<About />} />

        {/* Protected routes with role-based access */}
        <Route path="/logged_in/admin/:id" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/driver/:id" element={
          <ProtectedRoute allowedRoles={['driver']}>
            <Driver />
          </ProtectedRoute>
        } />

        <Route path="/logged_in/user/:id" element={
          <ProtectedRoute allowedRoles={['user']}>
            <User />
          </ProtectedRoute>
        } />
        <Route 
          path="/profile/:id" 
          element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          } 
        />
      </Routes>
      <Footer />
    </Router>
  );
}
export default App;
