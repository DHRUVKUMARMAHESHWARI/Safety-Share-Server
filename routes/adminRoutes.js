import express from 'express';
import { 
    getStats, 
    getHeatmapData, 
    getTrends, 
    getPendingHazards,
    getAllHazards,
    deleteHazard,
    updateHazardStatus
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Apply protection and admin check to all routes
router.use(protect);
router.use(authorize('admin'));

router.get('/stats', getStats);
router.get('/heatmap', getHeatmapData);
router.get('/trends', getTrends);
router.get('/pending-hazards', getPendingHazards);
router.get('/hazards', getAllHazards);
router.delete('/hazards/:id', deleteHazard);
router.put('/hazards/:id/status', updateHazardStatus);

export default router;
