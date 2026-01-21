import express from 'express';
import { getLeaderboard, getDashboardData } from '../controllers/communityController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/leaderboard', getLeaderboard);
router.get('/dashboard', protect, getDashboardData);

export default router;
