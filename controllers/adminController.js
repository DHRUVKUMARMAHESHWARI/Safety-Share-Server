import Hazard from '../models/Hazard.js';
import User from '../models/User.js';
import UserTracking from '../models/UserTracking.js';

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getStats = async (req, res) => {
    try {
        const totalHazards = await Hazard.countDocuments();
        const activeHazards = await Hazard.countDocuments({ status: 'active' });
        const pendingHazards = await Hazard.countDocuments({ status: 'pending' });
        const resolvedHazards = await Hazard.countDocuments({ status: 'resolved' });
        
        // Active users in last 24h
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsers24h = await UserTracking.countDocuments({ lastUpdated: { $gt: yesterday } });
        const totalUsers = await User.countDocuments();

        // Group by Type
        const hazardsByType = await Hazard.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);

        // Group by Severity
        const hazardsBySeverity = await Hazard.aggregate([
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);

        // Top Reporters
        const topReporters = await Hazard.aggregate([
            { 
                $match: { createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // Last 30 days
            },
            { $group: { _id: '$reportedBy', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $project: { name: '$user.name', count: 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                counts: {
                    total: totalHazards,
                    active: activeHazards,
                    pending: pendingHazards,
                    resolved: resolvedHazards,
                    users: totalUsers,
                    activeUsers: activeUsers24h
                },
                byType: hazardsByType,
                bySeverity: hazardsBySeverity,
                topReporters
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get hazard heatmap data
// @route   GET /api/admin/heatmap
// @access  Private/Admin
export const getHeatmapData = async (req, res) => {
    try {
        // Return only necessary fields to keep payload small
        const points = await Hazard.find({ status: { $in: ['active', 'resolved'] } })
            .select('location severity type -_id')
            .lean();

        const formattedPoints = points.map(p => ({
            lat: p.location.coordinates[1],
            lng: p.location.coordinates[0],
            severity: p.severity,
            weight: p.severity === 'critical' ? 1.0 : p.severity === 'high' ? 0.7 : 0.4
        }));

        res.status(200).json({ success: true, count: formattedPoints.length, data: formattedPoints });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get hazard trends (time series)
// @route   GET /api/admin/trends
// @access  Private/Admin
export const getTrends = async (req, res) => {
    try {
        const { period = 'month' } = req.query; // week, month, year
        
        let matchStage = {};
        let groupFormat = '';
        const now = new Date();

        if (period === 'week') {
            matchStage = { createdAt: { $gt: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
            groupFormat = '%Y-%m-%d';
        } else if (period === 'month') {
            matchStage = { createdAt: { $gt: new Date(now - 30 * 24 * 60 * 60 * 1000) } };
            groupFormat = '%Y-%m-%d';
        } else {
             matchStage = { createdAt: { $gt: new Date(now - 365 * 24 * 60 * 60 * 1000) } };
             groupFormat = '%Y-%m';
        }

        const trends = await Hazard.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({ success: true, data: trends });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get pending hazards
// @route   GET /api/admin/pending-hazards
// @access  Private/Admin
export const getPendingHazards = async (req, res) => {
    try {
        const pending = await Hazard.find({ status: 'pending' })
            .populate('reportedBy', 'name email')
            .sort({ createdAt: 1 })
            .limit(50);
            
        res.status(200).json({ success: true, count: pending.length, data: pending });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get all hazards (paginated)
// @route   GET /api/admin/hazards
// @access  Private/Admin
export const getAllHazards = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        
        const query = {};
        if (status) query.status = status;

        const hazards = await Hazard.find(query)
            .populate('reportedBy', 'name')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Hazard.countDocuments(query);

        res.status(200).json({ 
            success: true, 
            data: hazards, 
            pagination: { 
                page, 
                limit, 
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Delete hazard
// @route   DELETE /api/admin/hazards/:id
// @access  Private/Admin
export const deleteHazard = async (req, res) => {
    try {
        await Hazard.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update hazard status (resolve/verify)
// @route   PUT /api/admin/hazards/:id/status
// @access  Private/Admin
export const updateHazardStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const hazard = await Hazard.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.status(200).json({ success: true, data: hazard });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}
