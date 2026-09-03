import { checkForUserAuthentication, checkRole } from './auth.middleware.js';
import { asyncHandler } from '../utilities/asyncHandler.js';

// Combine authentication check with admin role check
export const verifyAdmin = [
  checkForUserAuthentication,
  checkRole(['admin'])
];

// Middleware to specifically verify admin for API endpoints
export const adminApiAuth = (req, res, next) => {
  checkForUserAuthentication(req, res, () => {
    if (req.userData && req.userData.role === 'admin') {
      return next();
    }
    return res.status(403).json({ 
      error: 'Access denied. Admin privileges required.',
      code: 'ADMIN_REQUIRED'
    });
  });
};

