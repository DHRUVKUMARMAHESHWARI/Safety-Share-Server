import Hazard from '../models/Hazard.js';
import { 
    calculateDistance, 
    calculateBearing, 
    decodePolyline, 
    isPointNearRoute, 
    isBearingWithinRange 
} from '../utils/geoUtils.js';

// Reusable logic for detecting hazards relevent to a user
export const detectHazards = async ({ location, heading, routePolyline, speed = 0, radiusKm = 2 }) => {
    const radiusMeters = radiusKm * 1000;
    
    // 1. Database Query: Broad geospatial search
    const nearbyHazards = await Hazard.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
                },
                $maxDistance: radiusMeters 
            }
        },
        status: { $in: ['active'] } // Only active hazards for alerts
    }).lean();

    if (!nearbyHazards.length) return [];

    const decodedPath = routePolyline ? decodePolyline(routePolyline) : [];
    
    // 2. Filter logic (Distance, Bearing, On-Route)
    const relevantHazards = nearbyHazards.filter(hazard => {
        const hazardLoc = { 
            lat: hazard.location.coordinates[1], 
            lng: hazard.location.coordinates[0] 
        };
        
        const distance = calculateDistance(location, hazardLoc);
        const bearingToHazard = calculateBearing(location, hazardLoc);
        
        // Filter by heading (Ahead of user)
        if (heading !== undefined && heading !== null && speed > 2) {
             if (!isBearingWithinRange(heading, bearingToHazard, 60)) {
                 // Exception: Very close hazards (<50m) alert regardless of heading
                 if (distance > 50) return false;
             }
        }

        // Filter by Route Polyline
        if (decodedPath.length > 0 && distance > 100) { 
           if (!isPointNearRoute(hazardLoc, decodedPath, 80)) { // 80m threshold
               return false;
           }
        }
        
        // Attach computed props
        hazard.distanceMeters = Math.round(distance);
        hazard.bearing = Math.round(bearingToHazard);
        
        return true;
    });
    
    return relevantHazards.sort((a, b) => a.distanceMeters - b.distanceMeters);
};
