import express from 'express';
import {
  register,
  login,
  getMe,
  googleLogin,
  refreshToken,
  logout,
  updateProfile
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting (5 requests per 15 mins)
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100, 
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again after 15 minutes'
    },
	standardHeaders: true, 
	legacyHeaders: false, 
});

// Apply rate limiter to sensitive routes
router.post('/register', apiLimiter, register);
router.post('/login', apiLimiter, login);
router.post('/google', googleLogin);

// Helper for refresh token, maybe less strict limit
router.post('/refresh', refreshToken);

router.use(protect); // All routes below this use the protect middleware
router.get('/me', getMe);
router.put('/profile', updateProfile);
router.post('/logout', logout);

export default router;
