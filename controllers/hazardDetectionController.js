import Hazard from '../models/Hazard.js';
import { 
    calculateDistance, 
    calculateBearing, 
    decodePolyline, 
    isPointNearRoute,
    isBearingWithinRange
} from '../utils/geoUtils.js';

// Simple in-memory cache for demo purposes
// Key: userId, Value: { timestamp, hazards }
const routeCheckCache = new Map();

// @desc    Check for hazards along a route
// @route   POST /api/hazards/check-route
// @access  Public (or Private)
export const checkHazardsOnRoute = async (req, res) => {
    try {
        const { currentLocation, heading, routePolyline, speed } = req.body;
        
        // Basic validation
        if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
            return res.status(400).json({ success: false, error: 'Current location is required' });
        }

        // Check Cache (Optional: implement if userId is available or based on location hash)
        // For now, let's skip cache logic to ensure real-time accuracy for this specific request, 
        // as location changes frequently.
        const radiusKm = 5; // Look ahead 5km
        const radiusMeters = radiusKm * 1000;
        
        // 1. Find all active hazards within broad radius using MongoDB Geospatial Index
        const nearbyHazards = await Hazard.find({
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(currentLocation.lng), parseFloat(currentLocation.lat)]
                    },
                    $maxDistance: radiusMeters 
                }
            },
            status: 'active'
        }).lean(); // Use lean for performance

        if (!nearbyHazards.length) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        // Decode Polyline once
        const decodedPath = routePolyline ? decodePolyline(routePolyline) : [];

        // 2. Filter hazards that are relevant to the route
        const relevantHazards = nearbyHazards.filter(hazard => {
            const hazardLoc = { 
                lat: hazard.location.coordinates[1], 
                lng: hazard.location.coordinates[0] 
            };
            
            // Calculate distance
            const distance = calculateDistance(currentLocation, hazardLoc);
            
            // Calculate bearing
            const bearingToHazard = calculateBearing(currentLocation, hazardLoc);
            
            // Filter 1: Is it roughly ahead of us? (If heading is provided)
            // If speed is very low (< 5 km/h), heading might be unreliable, so maybe skip this check
            // or widen the angle.
            if (heading !== undefined && heading !== null && speed > 2) {
                 if (!isBearingWithinRange(heading, bearingToHazard, 60)) { // 60 degree cone
                     // Special case: If distance is very close (< 50m), warn anyway regardless of heading
                     if (distance > 50) return false;
                 }
            }

            // Filter 2: Is it actually ON or very near our route path?
            // Only perform if we have a polyline
            if (decodedPath.length > 0) {
                // To be efficient, only check if hazard is further than immediate vicinity
                if (distance > 100) { 
                   if (!isPointNearRoute(hazardLoc, decodedPath, 50)) { // 50m threshold from route line
                       return false;
                   }
                }
            }
            
            // Attach computed properties for response
            hazard.distanceMeters = Math.round(distance);
            hazard.bearing = Math.round(bearingToHazard);
            
            return true;
        });

        // 3. Sort by distance
        relevantHazards.sort((a, b) => a.distanceMeters - b.distanceMeters);

        res.status(200).json({
            success: true,
            count: relevantHazards.length,
            data: relevantHazards
        });

    } catch (err) {
        console.error('Hazard detection error:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
