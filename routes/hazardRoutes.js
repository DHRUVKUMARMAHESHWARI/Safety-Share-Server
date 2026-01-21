import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  reportHazard,
  getNearbyHazards,
  getHazard,
  getMyReports,
  updateHazard
} from '../controllers/hazardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

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
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

import { checkHazardsOnRoute } from '../controllers/hazardDetectionController.js';

import { validateHazard, getHazardValidations } from '../controllers/validationController.js';

// Routes
router.post('/check-route', checkHazardsOnRoute);
router.post('/report', protect, upload.single('photo'), reportHazard);
router.get('/nearby', getNearbyHazards);
router.get('/my-reports', protect, getMyReports);

router.post('/:id/validate', protect, validateHazard);
router.get('/:id/validations', getHazardValidations);

router.route('/:id')
    .get(getHazard)
    .patch(protect, upload.single('photo'), updateHazard);

export default router;
