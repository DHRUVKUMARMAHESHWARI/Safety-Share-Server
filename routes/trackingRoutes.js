import express from 'express';
import { updateLocation, getNearbyUsers } from '../controllers/trackingController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/update', protect, updateLocation);
router.get('/nearby-users', protect, getNearbyUsers);

export default router;
