import { Router } from 'express';
import { 
  getDriverBus,
  updateLocation,
  clearStop,
  getTripOptions,
  initializeTrip,
  getDriverSchedule
} from '../../controllers/driver/driver.controller.js';
import { driverApiAuth } from '../../middleware/driverAuth.middleware.js';

const router = Router();

// Apply driver authentication middleware to all routes
router.use(driverApiAuth);

// Get driver's bus
router.get('/my-bus', getDriverBus);

// Get driver 7-day schedule
router.get('/schedule', getDriverSchedule);

// Update bus location
router.post('/update-location', updateLocation);

// Clear a stop
router.post('/clear-stop', clearStop);

// New routes for trip initialization
router.get('/trip-options/:id', getTripOptions);
router.post('/initialize-trip', initializeTrip);

export default router;
