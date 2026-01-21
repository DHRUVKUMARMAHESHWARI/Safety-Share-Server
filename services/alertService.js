// In-memory cache for tracking shown alerts
// Structure: Map<userId, Map<hazardId, timestamp>>
const alertHistory = new Map();
const ALERT_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// Cleanup job (run every hour or so in a real app, here we just check access)
const cleanUpHistory = (userId) => {
    if (!alertHistory.has(userId)) return;
    
    const userHistory = alertHistory.get(userId);
    const now = Date.now();
    
    for (const [hazardId, timestamp] of userHistory.entries()) {
        if (now - timestamp > ALERT_COOLDOWN) {
            userHistory.delete(hazardId);
        }
    }
    
    if (userHistory.size === 0) {
        alertHistory.delete(userId);
    }
};

export const processAlerts = (userId, hazards) => {
    if (!hazards || hazards.length === 0) return [];

    let processedAlerts = [];
    const now = Date.now();

    // Init history for user if needed
    if (!alertHistory.has(userId)) {
        alertHistory.set(userId, new Map());
    }
    const userHistory = alertHistory.get(userId);

    // Run cleanup occasionally (simple check: if history is getting big)
    if (userHistory.size > 20) cleanUpHistory(userId);

    for (const hazard of hazards) {
        const distance = hazard.distanceMeters;
        let alertLevel = null;
        let voiceMessage = '';

        // Determine Alert Thresholds
        if (distance <= 200 && hazard.severity === 'critical') {
            alertLevel = 'urgent';
            voiceMessage = `Warning: Critical ${hazard.type.replace('_', ' ')} ahead.`;
        } else if (distance <= 500 && ['high', 'critical'].includes(hazard.severity)) {
            alertLevel = 'warning';
            voiceMessage = `Caution: ${hazard.type.replace('_', ' ')} in 500 meters.`;
        } else if (distance <= 800) {
            alertLevel = 'info';
            // Info alerts usually silent or just a ding
        }

        // Processing
        if (alertLevel) {
            // Check deduplication
            const lastShown = userHistory.get(hazard._id.toString());
            
            if (!lastShown || (now - lastShown > ALERT_COOLDOWN)) {
                // New Alert
                processedAlerts.push({
                    hazardId: hazard._id,
                    type: hazard.type,
                    severity: hazard.severity,
                    distance,
                    alertLevel,
                    voiceMessage,
                    location: hazard.location
                });
                
                // Update history
                userHistory.set(hazard._id.toString(), now);
            }
        }
    }

    return processedAlerts;
};

// Reset history if route significantly changes (Optional hook)
export const clearUserAlertCache = (userId) => {
    alertHistory.delete(userId);
};
