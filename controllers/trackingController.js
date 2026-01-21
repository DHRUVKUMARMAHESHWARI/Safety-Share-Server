import UserTracking from '../models/UserTracking.js';
import { detectHazards } from '../services/hazardService.js';
import { processAlerts } from '../services/alertService.js';

// @desc    Update user location & Check for alerts
// @route   POST /api/tracking/update
// @access  Private
export const updateLocation = async (req, res) => {
    try {
        const { location, speed, heading, isMoving, routePolyline } = req.body;
        const userId = req.user.id;
        
        if (!location || !location.lat || !location.lng) {
            return res.status(400).json({ success: false, error: 'Location required' });
        }

        // 1. Upsert Tracking Data
        await UserTracking.findOneAndUpdate(
            { userId },
            {
                currentLocation: {
                    type: 'Point',
                    coordinates: [location.lng, location.lat]
                },
                speed,
                heading,
                isMoving,
                lastUpdated: new Date(),
                // Only update route if provided (to avoid clearing it on partial updates)
                ...(routePolyline && { 
                    activeRoute: { polyline: routePolyline } 
                })
            },
            { upsert: true, new: true }
        );

        // 2. Hazard Detection & Alerts
        let alerts = [];
        let nearbyHazards = [];

        // Only check if moving or if forced check (design choice: let's do it if moving)
        // If speed is 0, we typically don't need urgent alerts updates unless new hazard appeared.
        // For simplicity/safety, we check always or if speed > 0. Let's check always for now.
        
        // Detect relevant hazards
        const detectedHazards = await detectHazards({
            location,
            heading,
            routePolyline,
            speed
        });
        
        // Process alerts (deduplication logic)
        alerts = processAlerts(userId, detectedHazards);
        
        // Prepare response
        // Client might want "nearbyHazards" for map display (broader set)
        
        res.status(200).json({
            success: true,
            alerts,
            // Return top 5 relevant hazards for display even if not alerting
            nearbyDisplay: detectedHazards.slice(0, 5) 
        });
        
        // 3. Emit Socket Event (if connected)
        if (req.io) {
             // We can emit to a specific room for this user if we joined them on connection
             // req.io.to(`user:${userId}`).emit('tracking_update', { alerts });
        }

    } catch (err) {
        console.error('Tracking error:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get nearby active users (Admin/Dashboard)
// @route   GET /api/tracking/nearby-users
// @access  Private (Admin)
export const getNearbyUsers = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Authorized access only' });
        }

        const users = await UserTracking.find({
            lastUpdated: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Active in last hour
        }).select('currentLocation speed heading isMoving'); 
        // Exclude userId for anonymity if strictly needed, or include if admin needs it.
        // Prompt says "Anonymize data"

        const formattedUsers = users.map(u => ({
            location: {
                lat: u.currentLocation.coordinates[1],
                lng: u.currentLocation.coordinates[0]
            },
            speed: u.speed,
            heading: u.heading,
            isMoving: u.isMoving
        }));

        res.status(200).json({
            success: true,
            count: formattedUsers.length,
            data: formattedUsers
        });

    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
