import User from '../models/User.js';
import Hazard from '../models/Hazard.js';

// @desc    Get leaderboard
// @route   GET /api/community/leaderboard
// @access  Public
export const getLeaderboard = async (req, res) => {
    try {
        const topUsers = await User.find()
            .sort({ points: -1 })
            .limit(10)
            .select('name points level stats');

        res.status(200).json({
            success: true,
            data: topUsers
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get user's detailed stats and activity
// @route   GET /api/community/dashboard
// @access  Private
export const getDashboardData = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        // 1. Recent Reports
        const recentReports = await Hazard.find({ reportedBy: req.user.id })
            .sort({ createdAt: -1 })
            .limit(3);

        // 2. Activity Chart (Last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Get count of reports per day
        const reportsAggregation = await Hazard.aggregate([
            {
                $match: {
                    reportedBy: req.user.id,
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get count of validations per day
        // This is tricky because validations are subdocuments in Hazard
        const validationsAggregation = await Hazard.aggregate([
            { $unwind: "$confirmations" },
            {
                $match: {
                    "confirmations.userId": req.user.id,
                    "confirmations.timestamp": { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$confirmations.timestamp" } },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Merge aggregation results into a 7-day format for the chart
        const activityData = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

            const reportsCount = reportsAggregation.find(r => r._id === dateStr)?.count || 0;
            const valCount = validationsAggregation.find(v => v._id === dateStr)?.count || 0;

            activityData.unshift({
                name: dayName,
                reports: reportsCount,
                val: valCount
            });
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    points: user.points,
                    level: user.level,
                    xp: user.xp,
                    stats: user.stats,
                    achievements: user.achievements
                },
                recentReports,
                activityData
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
