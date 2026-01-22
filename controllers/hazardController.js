import Hazard from '../models/Hazard.js';
import User from '../models/User.js';
import { incrementReportStats } from '../services/reputationService.js';
import { userLocations } from '../utils/socketStore.js';

// --- GEOSPATIAL UTILITIES ---

const toRad = (val) => (val * Math.PI) / 180;
const toDeg = (val) => (val * 180) / Math.PI;

// Calculate distance in km
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate bearing from P1 to P2
const getBearing = (lat1, lon1, lat2, lon2) => {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

// --- CONTROLLERS ---

// @desc    Report a new hazard
// @route   POST /api/hazards/report
// @access  Private
// @rateLimit 5 requests per 15 min per user (handled in routes)
export const reportHazard = async (req, res) => {
  try {
    const { type, location, severity, description, bearing } = req.body;
    let parsedLocation;
    
    try {
        parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid location format' });
    }

    if (!parsedLocation || !parsedLocation.lat || !parsedLocation.lng) {
      return res.status(400).json({ success: false, error: 'Please provide latitude and longitude' });
    }

    const lat = parseFloat(parsedLocation.lat);
    const lng = parseFloat(parsedLocation.lng);

    // Validate coordinates (Safety Check)
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    // Duplicate Probability Check
    const existingHazard = await Hazard.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 100, // 100m duplicate radius
        },
      },
      status: { $in: ['active', 'pending'] },
      type: type 
    });

    if (existingHazard) {
      return res.status(400).json({
        success: false,
        error: 'A similar hazard has already been reported nearby.',
        existingId: existingHazard._id
      });
    }

    // Decay Logic: Short-lived hazards vs long-term
    // Police/Animals/Waterlogging etc -> 4 hours
    // Constant Potholes/Construction -> 14 days
    const SHORT_LIVED = ['police_checking', 'waterlogging', 'accident'];
    const expiresAt = new Date();
    if (SHORT_LIVED.includes(type)) {
        expiresAt.setHours(expiresAt.getHours() + 4);
    } else {
        expiresAt.setDate(expiresAt.getDate() + 14);
    }

    // Photo
    let photoUrl = '';
    if (req.file) {
      photoUrl = `/uploads/hazards/${req.file.filename}`;
    }

    const hazard = await Hazard.create({
      type,
      location: { type: 'Point', coordinates: [lng, lat] },
      bearing: bearing || null,
      severity,
      description,
      photoUrl,
      reportedBy: req.user.id,
      status: 'pending', // Pending community verification
      expiresAt
    });

    // Update User Reputation
    await incrementReportStats(req.user.id);

    // Task 3: WebSocket Broadcasting (Optimized)
    // Broadcast ONLY to users within 5km
    if (req.io) {
        const BROADCAST_RADIUS_KM = 5;
        let notifiedCount = 0;
        
        userLocations.forEach((userPos, socketId) => {
            const dist = getDistance(lat, lng, userPos.lat, userPos.lng);
            if (dist <= BROADCAST_RADIUS_KM) {
                req.io.to(socketId).emit('new_hazard', hazard);
                notifiedCount++;
            }
        });
        
        if (config.env === 'development') {
            console.log(`Hazard Broadcasted to ${notifiedCount} users within ${BROADCAST_RADIUS_KM}km`);
        }
    }

    res.status(201).json({
      success: true,
      data: hazard,
    });
  } catch (err) {
    console.error('Report Error:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get hazards nearby with Logic Gate for Alert Zones
// @route   GET /api/hazards/nearby
// @access  Public
export const getNearbyHazards = async (req, res) => {
  try {
    const { lat, lng, radius, hearing, speed } = req.query; // 'hearing' usually means heading/bearing

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    const startLat = parseFloat(lat);
    const startLng = parseFloat(lng);
    const userHeading = parseFloat(hearing) || 0;
    const filterByBearing = !!hearing; // If user provides heading, we filter "behind" hazards
    
    // Default 5km
    const radiusInKm = parseFloat(radius) || 5; 
    const radiusInMeters = radiusInKm * 1000;

    // Advanced Geospatial Query
    const hazards = await Hazard.find({
      location: {
        $near: {
            $geometry: { type: "Point", coordinates: [startLng, startLat] },
            $maxDistance: radiusInMeters
        }
      },
      status: { $in: ['active', 'pending'] }
    }).populate('reportedBy', 'name trustScore');

    // Post-Processing: Filtering & zoning
    const processedHazards = hazards.map(h => {
        const hLat = h.location.coordinates[1];
        const hLng = h.location.coordinates[0];
        const distMeters = getDistance(startLat, startLng, hLat, hLng) * 1000;
        
        // 1. BEARING FILTER (Exclude hazards behind driver)
        // If driver is moving (speed > 5km/h maybe? assumed true if heading sent)
        // Check if hazard is within +/- 90 degrees of forward view
        if (filterByBearing) {
            const bearingToHazard = getBearing(startLat, startLng, hLat, hLng);
            const diff = Math.abs(bearingToHazard - userHeading);
            const angleDiff = diff > 180 ? 360 - diff : diff;
            
            // If it's more than 90 degrees away (i.e., behind or mostly side), mark for filtering
            // But let's just flag it irrelevant for Alerts, maybe still show on Map?
            // Requirement: "Driver ... should not receive alerts". So we return it but flag `relevant: false`
            if (angleDiff > 100) return null; // Harsh filter: Remove completely?
        }

        // 2. LOGIC GATE: Alert Zones
        let zone = 'NONE';
        if (distMeters < 200) zone = 'ZONE_C_URGENT';
        else if (distMeters < 500) zone = 'ZONE_B_WARNING';
        else if (distMeters < 800) zone = 'ZONE_A_CAUTION';

        return {
            ...h.toObject(),
            distanceMeters: distMeters,
            alertZone: zone
        };
    }).filter(Boolean); // Remove nulls

    res.status(200).json({
      success: true,
      count: processedHazards.length,
      data: processedHazards,
    });
  } catch (err) {
    console.error('Nearby Error:', err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get single hazard
// @route   GET /api/hazards/:id
export const getHazard = async (req, res) => {
  try {
    const hazard = await Hazard.findById(req.params.id)
        .populate('reportedBy', 'name profile trustScore');

    if (!hazard) {
      return res.status(404).json({ success: false, error: 'Hazard not found' });
    }

    res.status(200).json({ success: true, data: hazard });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get My Reports
// @route   GET /api/hazards/my-reports
export const getMyReports = async (req, res) => {
    try {
        const hazards = await Hazard.find({ reportedBy: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: hazards.length, data: hazards });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}

// @desc    Update Hazard
// @route   PATCH /api/hazards/:id
export const updateHazard = async (req, res) => {
    try {
        let hazard = await Hazard.findById(req.params.id);
        if (!hazard) return res.status(404).json({ success: false, error: 'Hazard not found' });

        if (hazard.reportedBy.toString() !== req.user.id && req.user.role !== 'admin') {
             return res.status(401).json({ success: false, error: 'Not authorized' });
        }
        
        const { description } = req.body;
        if (req.file) hazard.photoUrl = `/uploads/hazards/${req.file.filename}`;
        if (description) hazard.description = description;

        await hazard.save();
        res.status(200).json({ success: true, data: hazard });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}

// @desc    Validate (Confirm/Reject) a hazard
// @route   POST /api/hazards/:id/validate
export const validateHazard = async (req, res) => {
  try {
    const { action } = req.body; 
    const hazard = await Hazard.findById(req.params.id);

    if (!hazard) return res.status(404).json({ success: false, error: 'Hazard not found' });
    if (!hazard.canBeValidated(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Cannot validate again' });
    }

    if (action === 'confirm') {
      hazard.confirmations.push({ userId: req.user.id });
      // Trust Score Bump
      hazard.trustScore += 1;
      
      // Auto-Promotion
      if (hazard.confirmations.length >= 3 && hazard.status === 'pending') {
         hazard.status = 'active';
      }
    } else if (action === 'reject' || action === 'resolve') {
      hazard.rejections.push({ userId: req.user.id });
      hazard.trustScore -= 1;

      // Auto-Resolution (3 unique rejections)
      if (hazard.rejections.length >= 3) {
         hazard.status = 'resolved';
         hazard.resolvedAt = Date.now();
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    await hazard.save();

    // Reward the validator (Future: reputationService)

    res.status(200).json({ success: true, data: hazard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

import { config } from '../config/env.js';
