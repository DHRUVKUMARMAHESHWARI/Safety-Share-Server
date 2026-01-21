import Hazard from '../models/Hazard.js';
import User from '../models/User.js';
import { incrementReportStats } from '../services/reputationService.js';

// @desc    Report a new hazard
// @route   POST /api/hazards/report
// @access  Private
export const reportHazard = async (req, res) => {
  try {
    const { type, location, severity, description } = req.body;
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

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    // Check for duplicates within 50m
    const existingHazard = await Hazard.findOne({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: 50, // 50 meters
        },
      },
      status: { $in: ['active', 'pending'] },
      type: type // Same type only? Or any hazard? Usually same type avoids duplicates.
    });

    if (existingHazard) {
      return res.status(400).json({
        success: false,
        error: 'A similar hazard has already been reported nearby.',
      });
    }

    // Handle photo upload
    let photoUrl = '';
    if (req.file) {
      // In a real app, upload to S3/Cloudinary here.
      // For now, we use the local path served via static middleware (needs setup in server.js)
      photoUrl = `/uploads/hazards/${req.file.filename}`;
    }

    const hazard = await Hazard.create({
      type,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      severity,
      description,
      photoUrl,
      reportedBy: req.user.id,
      status: 'pending', // Initial status
      // expiresAt default is handled by Schema
    });

    // Update user stats and give XP
    incrementReportStats(req.user.id);

    res.status(201).json({
      success: true,
      data: hazard,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get hazards nearby
// @route   GET /api/hazards/nearby
// @access  Public (or Private depending on requirements, usually public for viewing)
export const getNearbyHazards = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Please provide valid latitude and longitude' });
    }

    const radiusInKm = parseFloat(radius) || 5;
    const radiusInMeters = radiusInKm * 1000;

    const hazards = await Hazard.find({
      location: {
        $near: {
            $geometry: {
                type: "Point",
                coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: radiusInMeters
        }
      },
      status: { $in: ['active', 'pending'] } // Only active/pending
    }).populate('reportedBy', 'name');

    // Add distance field virtually if needed, but $near sorts by distance.
    // If we want exact distance in response, we might need aggregate.
    // For simple viewing, $near result order is sufficient.
    
    res.status(200).json({
      success: true,
      count: hazards.length,
      data: hazards,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get single hazard
// @route   GET /api/hazards/:id
// @access  Public
export const getHazard = async (req, res) => {
  try {
    const hazard = await Hazard.findById(req.params.id)
        .populate('reportedBy', 'name profile');

    if (!hazard) {
      return res.status(404).json({ success: false, error: 'Hazard not found' });
    }

    res.status(200).json({
      success: true,
      data: hazard,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get My Reports
// @route   GET /api/hazards/my-reports
// @access  Private
export const getMyReports = async (req, res) => {
    try {
        const hazards = await Hazard.find({ reportedBy: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: hazards.length,
            data: hazards
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}

// @desc    Update Hazard
// @route   PATCH /api/hazards/:id
// @access  Private
export const updateHazard = async (req, res) => {
    try {
        let hazard = await Hazard.findById(req.params.id);

        if (!hazard) {
             return res.status(404).json({ success: false, error: 'Hazard not found' });
        }

        // Check ownership
        if (hazard.reportedBy.toString() !== req.user.id && req.user.role !== 'admin') {
             return res.status(401).json({ success: false, error: 'Not authorized to update this hazard' });
        }

        // Allow updates to description, photo?
        // Cannot update location or type as per requirements.
        
        const { description } = req.body;
        
        // Handle photo update if needed
        if (req.file) {
             hazard.photoUrl = `/uploads/hazards/${req.file.filename}`;
        }
        
        if (description) hazard.description = description;

        await hazard.save();

        res.status(200).json({
            success: true,
            data: hazard
        });

    } catch (err) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
}
