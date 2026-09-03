import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';
import { logger } from '../utilities/logger.js';

// Combine authentication check with driver role check
export const verifyDriver = [
  checkForUserAuthentication,
  checkRole(['driver'])
];

// Middleware to specifically verify driver for API endpoints
export const driverApiAuth = (req, res, next) => {
  checkForUserAuthentication(req, res, () => {
    if (req.userData && req.userData.role === 'driver') {
      return next();
    }
    return res.status(403).json({
      error: 'Access denied. Driver privileges required.',
      code: 'DRIVER_REQUIRED'
    });
  });
};