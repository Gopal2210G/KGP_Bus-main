import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Combine authentication check with role check
export const verifyUser = [
  checkForUserAuthentication,
  checkRole(['user', 'driver', 'admin'])
];

// Middleware to verify user authentication for API endpoints
export const userApiAuth = (req, res, next) => {
  checkForUserAuthentication(req, res, () => {
    if (req.userData) {
      return next();
    }
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_FAILED' 
    });
  });
};