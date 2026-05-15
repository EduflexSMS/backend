require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const API_URL = "https://eduflexback.vercel.app";

const app = express();

// Base middleware
// Allow cross-origin requests from frontend deployments.
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
app.use(express.json());

// Root health check (MUST be before any DB connection calls)
app.get('/', (req, res) => {
    res.json({ 
        status: 'Eduflex API is online', 
        time: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// DB Connection logic
let cachedDb = null;
const connectDB = async () => {
    if (cachedDb) return cachedDb;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    
    const db = await mongoose.connect(uri);
    cachedDb = db;
    return db;
};

// Error handling middleware for DB
app.use(async (req, res, next) => {
    if (req.path === '/' || req.path === '/api' || req.path === '/api/') return next(); // Skip DB for root
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('DB Error:', err.message);
        res.status(503).json({ error: 'Database unavailable', message: err.message });
    }
});

// Routes - using relative paths from this file (api/index.js)
// Since this file is in api/, paths to routes/ must go up one level
app.use('/api/auth', require('../routes/authRoutes'));
app.use('/api', require('../routes/studentRoutes'));
app.use('/api', require('../routes/subjectRoutes'));
app.use('/api', require('../routes/dashboardRoutes'));
app.use('/api/payments', require('../routes/paymentRoutes'));
app.use('/api/whatsapp', require('../routes/whatsappRoutes'));
app.use('/api/pos', require('../routes/posRoutes'));
app.use('/api', require('../routes/examRoutes'));

// Export for Vercel
module.exports = app;

// Local development
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Dev server on http://localhost:${PORT}`));
}
