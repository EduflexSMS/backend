const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const { sendSMS, formatMobileForSMS } = require('../utils/smsHelper');

// GET /api/sms/config
router.get('/config', async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: 'sms_config' });
        const config = setting ? setting.value : {
            enabled: false,
            url: process.env.SMS_GATEWAY_URL || '',
            user: process.env.SMS_GATEWAY_USER || '',
            token: process.env.SMS_GATEWAY_TOKEN || '',
            simSlot: 1
        };
        res.json(config);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/sms/config
router.post('/config', async (req, res) => {
    try {
        const { enabled, url, user, token, simSlot } = req.body;

        const updateData = {
            enabled: enabled !== undefined ? Boolean(enabled) : true,
            url: (url || '').trim(),
            user: (user || '').trim(),
            token: (token || '').trim(),
            simSlot: parseInt(simSlot) || 1
        };

        await Setting.findOneAndUpdate(
            { key: 'sms_config' },
            { key: 'sms_config', value: updateData },
            { upsert: true, new: true }
        );

        res.json({ message: 'SMS Gateway configuration saved successfully', config: updateData });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/sms/send
router.post('/send', async (req, res) => {
    try {
        const { mobile, message } = req.body;
        if (!mobile || !message) {
            return res.status(400).json({ message: 'Mobile and message are required' });
        }

        const result = await sendSMS(mobile, message);
        if (result.success) {
            res.json({ success: true, message: 'SMS sent successfully', result });
        } else {
            res.status(400).json({ success: false, message: result.error || 'Failed to send SMS', result });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/sms/test
router.post('/test', async (req, res) => {
    try {
        const { mobile, url, user, token, simSlot } = req.body;
        if (!mobile) {
            return res.status(400).json({ message: 'Mobile number is required for test SMS' });
        }

        // If temporary config is sent with test request, use it or save it
        if (url) {
            await Setting.findOneAndUpdate(
                { key: 'sms_config' },
                { key: 'sms_config', value: { enabled: true, url, user, token, simSlot: simSlot || 1 } },
                { upsert: true, new: true }
            );
        }

        const testMsg = `Eduflex SMS Test:\nYour Hutch SIM SMS Gateway is working successfully! Date: ${new Date().toLocaleTimeString()}`;
        const result = await sendSMS(mobile, testMsg);

        if (result.success) {
            res.json({ success: true, message: `Test SMS sent to ${formatMobileForSMS(mobile)}! Check your phone.`, result });
        } else {
            res.status(400).json({
                success: false,
                message: `Failed to reach Phone Gateway: ${result.error || 'Please check IP address and ensure phone is on Wi-Fi.'}`,
                result
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
