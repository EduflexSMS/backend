const axios = require('axios');

/**
 * Formats a mobile number for Sri Lanka/International WhatsApp sending.
 * - Removes non-digits, spaces, plus signs.
 * - Converts local format starting with '0' (e.g. 0771234567) to '94771234567'.
 * - Prepends '94' to any 9-digit number.
 * @param {string} mobile 
 * @returns {string}
 */
function formatMobileNumber(mobile) {
    if (!mobile) return '';
    let cleaned = mobile.replace(/[^\d+]/g, '').trim(); // Remove spaces, dashes, etc.
    cleaned = cleaned.replace('+', '');
    
    // If it starts with 0, replace it with 94
    if (cleaned.startsWith('0')) {
        cleaned = '94' + cleaned.slice(1);
    }
    
    // If it doesn't start with 94 and is 9 digits (e.g. 771234567), prepend 94
    if (cleaned.length === 9 && !cleaned.startsWith('94')) {
        cleaned = '94' + cleaned;
    }
    
    return cleaned;
}

/**
 * Sends a WhatsApp message using the UltraMsg API.
 * Falls back to mock console logging in development mode if keys are not defined.
 * @param {string} mobile 
 * @param {string} message 
 * @returns {Promise<{success: boolean, data?: any, mock?: boolean, error?: string}>}
 */
const sendWhatsAppMessage = async (mobile, message) => {
    try {
        if (!mobile || !message) {
            console.error("[WhatsApp] Mobile number and message are required");
            return { success: false, error: "Mobile number and message are required" };
        }

        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;

        const finalMobile = formatMobileNumber(mobile);

        if (!instanceId || !token) {
            console.log("\n[DEV MODE] --- MOCK WHATSAPP MESSAGE ---");
            console.log(`To: ${finalMobile} (original: ${mobile})`);
            console.log(`Message: \n${message}\n`);
            console.log("----------------------------------------\n");
            return { success: true, mock: true, message: "Mock message logged to console." };
        }

        // Format number: UltraMsg requires '1234567890@c.us' format. 
        const formattedMobile = finalMobile + '@c.us';

        const params = new URLSearchParams();
        params.append('token', token);
        params.append('to', formattedMobile);
        params.append('body', message);

        const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
        
        const response = await axios.post(url, params);
        console.log(`[WhatsApp] Message sent successfully to ${finalMobile}`);
        return { success: true, data: response.data };
    } catch (error) {
        console.error("WhatsApp Helper Error:", error.response ? error.response.data : error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    formatMobileNumber,
    sendWhatsAppMessage
};
