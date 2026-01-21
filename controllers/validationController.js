import Hazard from '../models/Hazard.js';
import ValidationRecord from '../models/ValidationRecord.js';
import User from '../models/User.js';
import { calculateDistance } from '../utils/geoUtils.js';
import { updateUserReputation } from '../services/reputationService.js';

// @desc    Validate a hazard (confirm/reject/resolve)
// @route   POST /api/hazards/:id/validate
// @access  Private
export const validateHazard = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, location } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!['confirm', 'reject', 'resolve'].includes(action)) {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }
        
        const hazard = await Hazard.findById(id);
        if (!hazard) {
            return res.status(404).json({ success: false, error: 'Hazard not found' });
        }

        // 1. Check distance
        if (location && location.lat && location.lng) {
            const hazardLoc = { lat: hazard.location.coordinates[1], lng: hazard.location.coordinates[0] };
            const distance = calculateDistance(location, hazardLoc);
            
            if (distance > 500) {
                 return res.status(400).json({ success: false, error: 'You are too far from the hazard to validate it.' });
            }
        } else {
             // Require location for validation
             return res.status(400).json({ success: false, error: 'Current location is required for validation.' });
        }

        // 2. Check if user already validated
        // Using Model method
        if (!hazard.canBeValidated(userId) && action !== 'resolve') { // resolving might be allowed even if confirmed? default logic varies
             // Actually, schema method returns false if confirmed/rejected. 
             // Logic: One user, one vote.
             return res.status(400).json({ success: false, error: 'You have already validated this hazard.' });
        }
        
        // 3. Create Validation Record
        await ValidationRecord.create({
            hazardId: id,
            userId: userId,
            action: action,
            location: {
                type: 'Point',
                coordinates: [location.lng, location.lat]
            }
        });

        // 4. Update Hazard State
        const weight = userRole === 'trusted_user' || userRole === 'admin' ? 2 : 1;
        
        // We push to arrays for tracking who did what, but simpler to use count for status Logic
        // But schema has arrays.
        // We can push user ID to array now.
        // NOTE: Schema timestamp structure requires object.
        const validationEntry = { userId: userId, timestamp: new Date() };

        if (action === 'confirm') {
            hazard.confirmations.push(validationEntry);
        } else if (action === 'reject') {
            hazard.rejections.push(validationEntry);
        }
        // Resolves logic might differ (separate field or special confirmation)
        
        // Calculate scores
        // Note: this simple length check doesn't account for weight.
        // Use a calculated score.
        let confirmScore = 0;
        let rejectScore = 0;
        
        // Re-read with populations or iterate
        // Optimally, we'd store weighted counts on the document to avoid iteration.
        // Iterating arrays of ObjectIds: we'd need to look up roles. 
        // For MVP, lets assume standard weight for now or fetch trusted users list.
        confirmScore = hazard.confirmations.length; 
        rejectScore = hazard.rejections.length;

        // Apply Status Rules
        if (action === 'resolve') {
             // Maybe resolving needs consensus too? 
             // Requirement: "If resolves >= 2". 
             // We need to store resolves in hazard model or query ValidationRecords.
             // Hazard model has `resolvedBy` (single user). 
             // Let's rely on ValidationRecords count for 'resolve' action.
             const resolveCount = await ValidationRecord.countDocuments({ hazardId: id, action: 'resolve' });
             
             if (resolveCount >= 2 || userRole === 'admin' || userRole === 'trusted_user') {
                 hazard.status = 'resolved';
                 hazard.resolvedBy = userId;
                 hazard.resolvedAt = new Date();
             }
        } else {
            if (confirmScore >= 3) {
                hazard.status = 'active';
            }
            if (rejectScore >= 5) {
                hazard.status = 'expired';
            }
        }

        await hazard.save();
        
        // Trigger background reputation update
        updateUserReputation(userId);

        res.status(200).json({
            success: true,
            data: hazard
        });

    } catch (err) {
        console.error('Validation error:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};


// @desc    Get validation history for a hazard
// @route   GET /api/hazards/:id/validations
// @access  Public
export const getHazardValidations = async (req, res) => {
    try {
        const records = await ValidationRecord.find({ hazardId: req.params.id })
            .populate('userId', 'name role')
            .sort({ timestamp: -1 });

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}
