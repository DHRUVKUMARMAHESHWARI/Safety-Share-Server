import express from 'express';
import { protect } from '../middleware/auth.js';
import { subscribe, sendNotification, getVapidPublicKey } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/vapid-key', getVapidPublicKey);
router.post('/subscribe', protect, subscribe);
router.post('/send', protect, sendNotification); // In real app, restrict to admin or internal service

export default router;
