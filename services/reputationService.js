import User from '../models/User.js';
import ValidationRecord from '../models/ValidationRecord.js';
import Hazard from '../models/Hazard.js';

// Helper to calculate level from XP
const calculateLevel = (xp) => {
    return Math.floor(xp / 500) + 1;
};

// Add XP and handle level up
export const addXp = async (userId, amount) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        user.xp += amount;
        user.points += amount; // Points and XP are sync for now
        
        const newLevel = calculateLevel(user.xp);
        if (newLevel > user.level) {
            user.level = newLevel;
            // Potentially trigger "level up" notification via Socket.io/Push?
        }

        await user.save();
    } catch (err) {
        console.error('Add XP error:', err);
    }
};

// Calculate and update user reputation stats
export const updateUserReputation = async (userId) => {
  if (!userId) return;

  try {
    const totalValidations = await ValidationRecord.countDocuments({ userId });
    
    // Update user stats
    const user = await User.findById(userId);
    if (!user) return;

    user.stats.validationsCount = totalValidations;
    
    // Give XP for validation activity
    // Only if totalValidations increased since last check? 
    // For simplicity, we assume this is called on every new validation.
    // So we add 10 XP.
    await addXp(userId, 10);

    // Promotion logic
    if (totalValidations > 50 && user.role === 'driver') {
         user.role = 'trusted_user';
    }
    
    await user.save();
    
  } catch (err) {
    console.error('Reputation update error:', err);
  }
};

// New function to update report stats
export const incrementReportStats = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        user.stats.reportsCount += 1;
        await addXp(userId, 50); // Reporting gets more XP (50)
        
        await user.save();
    } catch (err) {
        console.error('Update report stats error:', err);
    }
};
