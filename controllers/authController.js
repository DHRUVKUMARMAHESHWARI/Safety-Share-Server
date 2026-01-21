import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate Access Token
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
  });
};

// Generate Refresh Token
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  });
};

// Send Token Response
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // In a real production app, you might want to store refresh tokens in DB or Redis 
  // to manage revocation. For now, we'll just send them.

  // Options for cookies
  const options = {
    expires: new Date(
      Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRE) || 30) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }
  
  // We are returning tokens in body for easier client consumption as requested
  // but also setting cookie as a best practice option.

  res
    .status(statusCode)
    // .cookie('token', token, options) 
    .json({
      success: true,
      token,
      refreshToken,
      user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
      }
    });
};


// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, role, profile } = req.body;

    // Check if user exists (email or phone)
    let user = await User.findOne({ 
        $or: [
            { email: email }, 
            { phone: phone ? phone : null } // Only check phone if provided
        ] 
    });

    if (user) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Create user
    user = await User.create({
      name,
      email,
      password,
      phone,
      role,
      profile
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
      if (err.code === 11000) {
           return res.status(400).json({ success: false, error: 'Duplicate field value entered' });
      }
      // Pass to global error handler if available, or just send error
    res.status(500).json({ success: false, error: err.message });
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { emailOrPhone, password } = req.body;

    // Validate email/phone & password
    if (!emailOrPhone || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email/phone and password' });
    }

    // Check for user (accepts email or phone)
    // Simple regex to check if input looks like an email
    const isEmail = String(emailOrPhone).toLowerCase().match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
    
    let query = {};
    if (isEmail) {
        query = { email: emailOrPhone.toLowerCase() };
    } else {
        query = { phone: emailOrPhone };
    }

    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
      res.status(500).json({ success: false, error: err.message });
  }
};


// @desc    Google Login
// @route   POST /api/auth/google
// @access  Public
export const googleLogin = async (req, res, next) => {
    try {
        const { tokenId } = req.body;
        
        const ticket = await client.verifyIdToken({
             idToken: tokenId,
             audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const { email, name, picture, sub } = ticket.getPayload();
        
        // Check if user exists
        let user = await User.findOne({ email });
        
        if (user) {
             // If user exists, but no googleId (legacy or email registered), update it
             if (!user.googleId) {
                 user.googleId = sub;
                 await user.save();
             }
             return sendTokenResponse(user, 200, res);
        }
        
        // If not, create a new user with random password (they can reset it later or just use Google)
         const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
        
        user = await User.create({
            name,
            email,
            password: randomPassword,
            googleId: sub,
            isVerified: true, // Google emails are verified
        });
        
        sendTokenResponse(user, 201, res);

    } catch (err) {
         res.status(400).json({ success: false, error: 'Google login failed', details: err.message });
    }
}


// @desc    Refresh Token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = async(req, res, next) => {
    const { refreshToken } = req.body;
    
    if(!refreshToken) {
         return res.status(401).json({success: false, error: 'No refresh token provided'});
    }
    
    try {
         const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
         
         const user = await User.findById(decoded.id);
         
         if(!user) {
              return res.status(401).json({success: false, error: 'User not found'});
         }
         
         const newAccessToken = generateAccessToken(user._id);
         
         res.status(200).json({
             success: true,
             token: newAccessToken
         });
         
    } catch(err) {
         return res.status(401).json({success: false, error: 'Invalid refresh token'});
    }
}


// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res, next) => {
//    res.cookie('token', 'none', {
//      expires: new Date(Date.now() + 10 * 1000),
//      httpOnly: true,
//    });
  
  // Since we are using mainly stateless JWTs on client side, 
  // the client is responsible for discarding the token.
  // We just send a success message.
  
  res.status(200).json({
    success: true,
    data: {},
  });
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
    try {
        const { name, phone, vehicleType, licenseNumber } = req.body;
        
        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;
        if (phone) fieldsToUpdate.phone = phone;
        
        // Profile sub-document
        if (vehicleType || licenseNumber) {
            fieldsToUpdate.profile = {};
            if (vehicleType) fieldsToUpdate.profile.vehicleType = vehicleType;
            if (licenseNumber) fieldsToUpdate.profile.licenseNumber = licenseNumber;
        }

        const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

