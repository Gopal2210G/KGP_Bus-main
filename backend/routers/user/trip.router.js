import { Router } from 'express';
import { cancelTrip, uncancelTrip, getCancelledTrips } from '../../controllers/user/trip.controller.js';
import { userApiAuth } from '../../middleware/userAuth.middleware.js';

const router = Router();

router.use(userApiAuth);

router.post('/cancel', cancelTrip);
router.post('/uncancel', uncancelTrip);
router.get('/cancelled', getCancelledTrips);

export default router;
