import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
      unique: true,
      sparse: true, // Allows null/undefined if we support phone-only login later
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ['driver', 'trusted_user', 'admin'],
      default: 'trusted_user',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    profile: {
      vehicleType: {
        type: String,
        enum: ['car', 'bike', 'scooter', 'truck', 'other'],
      },
      licenseNumber: String,
       // Add other profile fields as needed
    },
    // Gamification & Stats
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    achievements: [{
        achievementId: String,
        unlockedAt: { type: Date, default: Date.now }
    }],
    stats: {
        reportsCount: { type: Number, default: 0 },
        validationsCount: { type: Number, default: 0 },
        alertsReceived: { type: Number, default: 0 },
        kmDriven: { type: Number, default: 0 }
    },
    pushSubscription: {
        type: Object, // Stores endpoint, keys (p256dh, auth)
        select: false 
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(12); // Using 12 rounds as requested
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
