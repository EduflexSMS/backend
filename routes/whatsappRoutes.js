const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/send', async (req, res) => {
    try {
        const { mobile, message } = req.body;
        
        if (!mobile || !message) {
            return res.status(400).json({ success: false, error: "Mobile number and message are required" });
        }

        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;

        // Ensure mobile number is formatted correctly (e.g., removing +, handling local vs intl formatting based on what frontend sends)
        // Frontend sends 94xxxxxxxxx
        let finalMobile = mobile.replace('+', '').trim();
        
        if (!instanceId || !token) {
            // Fallback for development/testing if API keys are not yet configured
            console.log("\n[DEV MODE] --- MOCK WHATSAPP MESSAGE ---");
            console.log(`To: ${finalMobile}`);
            console.log(`Message: \n${message}\n`);
            console.log("----------------------------------------\n");
            console.log("Note: Configure ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN in frontend/backend .env to send real messages.");
            return res.status(200).json({ success: true, mock: true, message: "Mock message logged to console." });
        }

        // Format number: UltraMsg requires '1234567890@c.us' format. 
        const formattedMobile = finalMobile + '@c.us';

        const params = new URLSearchParams();
        params.append('token', token);
        params.append('to', formattedMobile);
        params.append('body', message);

        const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
        
        const response = await axios.post(url, params);

        res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error("WhatsApp API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: "Failed to send WhatsApp message" });
    }
});

module.exports = router;
