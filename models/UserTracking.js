import mongoose from 'mongoose';

const userTrackingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One tracking record per user (upsert logic usually)
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    speed: {
      type: Number, // In km/h or m/s depending on client input, likely m/s from GPS
      default: 0,
    },
    heading: {
      type: Number, // 0-360 degrees
      default: 0,
    },
    isMoving: {
      type: Boolean,
      default: false,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    activeRoute: {
      start: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: [Number],
      },
      end: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: [Number],
      },
      polyline: String, // Encoded polyline string
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userTrackingSchema.index({ currentLocation: '2dsphere' });
userTrackingSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 3600 }); // TTL Index: 1 hour

const UserTracking = mongoose.model('UserTracking', userTrackingSchema);

export default UserTracking;
