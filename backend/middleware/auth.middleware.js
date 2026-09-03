import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { logger } from '../utilities/logger.js';

export const checkForUserAuthentication = (req, res, next) => {
  try {
    const token = 
      req.headers.authorization?.split(' ')[1] || 
      req.cookies?.jwtToken;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const decodedToken = jwt.verify(token, process.env.JWT_KEY || process.env.JWT_SECRET || 'ReactBusAppKGP2026_SecureKey');
      
      // Ensure id property is present alongside userId for compatibility
      if (decodedToken.userId && !decodedToken.id) {
        decodedToken.id = decodedToken.userId;
      }

      req.userData = decodedToken;
      
      logger.info('User authenticated', { 
        userId: decodedToken.userId, 
        role: decodedToken.role
      });

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.info('Token expired', { errorType: error.name });
        return res.status(401).json({
          message: 'Token expired',
          expired: true
        });
      } else if (error.name === 'JsonWebTokenError') {
        logger.info('Invalid token', { errorType: error.name });
        return res.status(401).json({
          message: 'Invalid token',
          malformed: true
        });
      }
      
      throw error;
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      message: 'Authentication error'
    });
  }
};

// Middleware to check for specific roles
export const checkRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (roles.includes(req.userData.role)) {
      next();
    } else {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
  };
};


