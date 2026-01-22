import User from '../models/User.js';
import webpush from 'web-push';
import { config } from '../config/env.js';

// Configure Web Push with VAPID keys
// Ideally these should come from config/env.js, but accessing process.env directly here for now to ensure they are loaded
const publicVapidKey = config.vapidPublicKey;
const privateVapidKey = config.vapidPrivateKey;
const vapidMailto = config.vapidMailto || 'mailto:admin@saferoute.com';

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(
      vapidMailto,
      publicVapidKey,
      privateVapidKey
    );
} else {
    console.warn('VAPID Keys not found. Push notifications will not work.');
}

// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe
// @access  Private
export const subscribe = async (req, res) => {
    try {
        const subscription = req.body;
        
        // Save subscription to user profile
        await User.findByIdAndUpdate(req.user.id, {
            pushSubscription: subscription
        });

        res.status(201).json({ success: true, message: 'Subscribed successfully' });
        
        // Confirm with a welcome notification (Optional)
        /*
        const payload = JSON.stringify({ title: 'Notifications Enabled', body: 'You will now receive alerts for nearby hazards.' });
        webpush.sendNotification(subscription, payload).catch(err => console.error(err));
        */
    } catch (err) {
        console.error('Subscription Error:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get VAPID Public Key
// @route   GET /api/notifications/vapid-key
// @access  Public
export const getVapidPublicKey = (req, res) => {
    res.status(200).json({ success: true, publicKey: publicVapidKey });
};

// @desc    Send a push notification (Test or Admin)
// @route   POST /api/notifications/send
// @access  Private (Admin Only - typically)
export const sendNotification = async (req, res) => {
    try {
        const { userId, title, body, data } = req.body;
        
        const user = await User.findById(userId).select('+pushSubscription');
        
        if (!user || !user.pushSubscription) {
            return res.status(404).json({ success: false, error: 'User not found or not subscribed' });
        }

        const payload = JSON.stringify({ 
            title: title || 'SafeRoute Alert', 
            body: body || 'New hazard detected nearby!',
            data 
        });

        await webpush.sendNotification(user.pushSubscription, payload);

        res.status(200).json({ success: true, message: 'Notification sent' });
    } catch (err) {
        console.error('Send Notification Error:', err);
        res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
};
