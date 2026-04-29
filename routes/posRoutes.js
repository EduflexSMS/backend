const express = require('express');
const router = express.Router();
const posController = require('../controllers/posController');

router.post('/checkout', posController.processCheckout);

module.exports = router;
