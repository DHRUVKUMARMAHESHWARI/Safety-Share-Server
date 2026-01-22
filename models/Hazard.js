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
    bearing: {
        type: Number, // 0-360 degrees, direction of traffic flow/hazard relevance
        default: null
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'resolved', 'expired'],
      default: 'active', 
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    trustScore: {
        type: Number,
        default: 0
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
      // Default will be overwritten by controller logic based on type
      default: () => new Date(+new Date() + 24 * 60 * 60 * 1000), 
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
  
  // Safe check for reportedBy (whether populated or ObjectId)
  const reporterId = this.reportedBy._id ? this.reportedBy._id : this.reportedBy;
  if (reporterId.toString() === userId.toString()) return false;
  
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
