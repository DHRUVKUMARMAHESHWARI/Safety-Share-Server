import mongoose from 'mongoose';

const validationRecordSchema = new mongoose.Schema(
  {
    hazardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hazard',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['confirm', 'reject', 'resolve'],
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: [true, 'Please provide user coordinates at time of validation'],
      },
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // No timestamps needed as we have specific timestamp field
    versionKey: false,
  }
);

// Indexes for quick lookups
validationRecordSchema.index({ hazardId: 1, userId: 1 }, { unique: true }); // Prevent multiple validations by same user
validationRecordSchema.index({ hazardId: 1 });
validationRecordSchema.index({ userId: 1 });

const ValidationRecord = mongoose.model('ValidationRecord', validationRecordSchema);

export default ValidationRecord;
