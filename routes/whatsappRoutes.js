const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage } = require('../utils/whatsappHelper');

router.post('/send', async (req, res) => {
    try {
        const { mobile, message } = req.body;
        
        if (!mobile || !message) {
            return res.status(400).json({ success: false, error: "Mobile number and message are required" });
        }

        const result = await sendWhatsAppMessage(mobile, message);
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(500).json({ success: false, error: result.error || "Failed to send WhatsApp message" });
        }
    } catch (error) {
        console.error("WhatsApp Route Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to send WhatsApp message" });
    }
});

module.exports = router;
