import mongoose from 'mongoose';

const hazardSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'pothole',
        'accident',
        'roadblock',
        'police_checking',
        'waterlogging',
        'construction',
      ],
      required: [true, 'Please specify the hazard type'],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: [true, 'Please provide coordinates [lng, lat]'],
      },
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'resolved', 'expired'],
      default: 'active', // Assuming auto-active for simplicity, or pending if moderation needed
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    photoUrl: String,
    confirmations: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    rejections: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(+new Date() + 7 * 24 * 60 * 60 * 1000), // Default 7 days from now
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
hazardSchema.index({ location: '2dsphere' });
hazardSchema.index({ status: 1, expiresAt: 1 });
hazardSchema.index({ reportedBy: 1, createdAt: -1 });

// Virtuals
// Example: Distance calculation would typically happen in aggregation or query,
// but we can add a helper if needed. For Mongoose virtuals to work with distance,
// the distance usually needs to be part of the aggregation result.
// However, we can add a verification score virtual.
hazardSchema.virtual('verificationScore').get(function () {
  return (this.confirmations?.length || 0) - (this.rejections?.length || 0);
});

// Methods

// Check if hazard is expired
hazardSchema.methods.isExpired = function () {
  return Date.now() > this.expiresAt || this.status === 'expired';
};

// Check if hazard is active
hazardSchema.methods.isActive = function () {
  return (
    this.status === 'active' &&
    Date.now() < this.expiresAt &&
    !this.resolvedAt
  );
};

// Check if a user can validate (confirm/reject) this hazard
hazardSchema.methods.canBeValidated = function (userId) {
  if (!userId) return false;
  
  // Cannot validate own report
  if (this.reportedBy.toString() === userId.toString()) return false;
  
  // Check if already confirmed
  const confirmed = this.confirmations.some(
    (c) => c.userId.toString() === userId.toString()
  );
  if (confirmed) return false;

  // Check if already rejected
  const rejected = this.rejections.some(
    (r) => r.userId.toString() === userId.toString()
  );
  if (rejected) return false;

  return true;
};

const Hazard = mongoose.model('Hazard', hazardSchema);

export default Hazard;
