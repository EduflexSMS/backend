const axios = require('axios');
const Setting = require('../models/Setting');

/**
 * Formats mobile number for Sri Lankan local SIM sending.
 * Converts +94 / 94 to local 0XXXXXXXXX format, or trims leading spaces.
 * @param {string} mobile
 * @returns {string}
 */
function formatMobileForSMS(mobile) {
    if (!mobile) return '';
    let cleaned = mobile.replace(/[^\d+]/g, '').trim();

    // If it starts with +94
    if (cleaned.startsWith('+94')) {
        cleaned = '0' + cleaned.slice(3);
    }
    // If it starts with 94 and is 11 digits
    else if (cleaned.startsWith('94') && cleaned.length === 11) {
        cleaned = '0' + cleaned.slice(2);
    }
    // If it's 9 digits starting with 7
    else if (cleaned.length === 9 && cleaned.startsWith('7')) {
        cleaned = '0' + cleaned;
    }

    return cleaned;
}

/**
 * Sends an SMS via the configured Android Phone SMS Gateway.
 * @param {string} mobile
 * @param {string} message
 * @returns {Promise<{success: boolean, status: string, data?: any, error?: string}>}
 */
const sendSMS = async (mobile, message) => {
    try {
        if (!mobile || !message) {
            return { success: false, status: 'failed', error: 'Mobile and message are required' };
        }

        // 1. Fetch SMS Gateway config from database or environment
        let config = null;
        try {
            const settingRecord = await Setting.findOne({ key: 'sms_config' });
            if (settingRecord && settingRecord.value) {
                config = settingRecord.value;
            }
        } catch (dbErr) {
            console.error('[SMS Helper] DB read error:', dbErr.message);
        }

        const gatewayUrl = (config && config.url) || process.env.SMS_GATEWAY_URL;
        const isEnabled = config ? config.enabled !== false : Boolean(process.env.SMS_GATEWAY_URL);
        const token = (config && config.token) || process.env.SMS_GATEWAY_TOKEN || '';
        const user = (config && config.user) || process.env.SMS_GATEWAY_USER || '';
        const simSlot = (config && config.simSlot) || 1;

        if (!isEnabled || !gatewayUrl) {
            console.log(`[SMS Helper] SMS Skipped (Gateway not configured or disabled). To: ${mobile}`);
            return { success: false, status: 'skipped', error: 'Gateway not configured or disabled' };
        }

        const finalMobile = formatMobileForSMS(mobile);

        // 2. Prepare payload compatible with Android SMS Gateway (capcom6, Traccar, etc.)
        let targetUrl = gatewayUrl.trim();
        // If user entered just IP/port (e.g. http://192.168.1.50:8080), append /v1/sms/send
        if (!targetUrl.includes('/v1/sms') && !targetUrl.includes('/message') && !targetUrl.includes('/send')) {
            targetUrl = targetUrl.replace(/\/+$/, '') + '/v1/sms/send';
        }

        const payload = {
            phoneNumbers: [finalMobile],
            to: finalMobile,
            message: message,
            simNumber: parseInt(simSlot) || 1
        };

        const headers = {
            'Content-Type': 'application/json'
        };

        if (token && user) {
            const authStr = Buffer.from(`${user}:${token}`).toString('base64');
            headers['Authorization'] = `Basic ${authStr}`;
        } else if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        console.log(`[SMS Helper] Sending SMS to ${finalMobile} via ${targetUrl}...`);

        const response = await axios.post(targetUrl, payload, {
            headers,
            timeout: 6000 // 6 seconds timeout
        });

        console.log(`[SMS Helper] SMS successfully dispatched to phone gateway:`, response.status);
        return { success: true, status: 'sent', data: response.data };

    } catch (error) {
        const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[SMS Helper] Failed to send SMS:`, errMsg);
        return { success: false, status: 'failed', error: errMsg };
    }
};

module.exports = {
    formatMobileForSMS,
    sendSMS
};
