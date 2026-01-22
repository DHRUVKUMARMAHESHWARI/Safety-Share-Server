import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { body, query, validationResult } from 'express-validator';
import {
  reportHazard,
  getNearbyHazards,
  getHazard,
  getMyReports,
  updateHazard,
  validateHazard
} from '../controllers/hazardController.js';
import { protect } from '../middleware/auth.js';
import { checkHazardsOnRoute } from '../controllers/hazardDetectionController.js';

const router = express.Router();

// Rate Limiting for Reporting (Anti-Spam)
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 reports per IP/window
  message: { success: false, error: 'Too many reports, please try again later' }
});

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/hazards/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
  }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

// Validation Middleware
const validateReport = [
    // We expect 'location' to be a JSON string or object, need custom validator if complex
    // or validate independent fields if the client sends them separately. 
    // The controller handles JSON.parse, but checks here ensure basic integrity.
    body('type').notEmpty().withMessage('Hazard type is required'),
];

// Routes
router.post('/check-route', checkHazardsOnRoute);

router.post('/report', 
    protect, 
    reportLimiter, 
    upload.single('photo'), 
    validateReport,
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    },
    reportHazard
);

router.get('/nearby', 
    [
        query('lat').isFloat().withMessage('Valid Latitude required'),
        query('lng').isFloat().withMessage('Valid Longitude required')
    ],
    (req, res, next) => {
        const errors = validationResult(req);
        if(!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        next();
    },
    getNearbyHazards
);

router.get('/my-reports', protect, getMyReports);

router.post('/:id/validate', protect, validateHazard);

router.route('/:id')
    .get(getHazard)
    .patch(protect, upload.single('photo'), updateHazard);

export default router;
