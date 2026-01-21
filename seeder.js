import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import connectDB from './config/db.js';

// Load env vars
dotenv.config();

// Connect to DB
connectDB();

const seedAdmin = async () => {
  try {
    // Check if admin exists
    const adminExists = await User.findOne({ email: 'admin@saferoute.com' });

    if (adminExists) {
      console.log('Admin user already exists');
      process.exit();
    }

    // Create Admin User
    const user = await User.create({
      name: 'SafeRoute Admin',
      email: 'admin@saferoute.com',
      password: 'admin123', // Will be hashed by pre-save hook
      phone: '9999999999',
      role: 'admin',
      isVerified: true,
      profile: {
          vehicleType: 'other'
      }
    });

    console.log('Admin user created successfully');
    console.log('Email: admin@saferoute.com');
    console.log('Password: admin123');
    
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Wait a bit for DB connection to establish before running
setTimeout(() => {
    seedAdmin();
}, 2000);
