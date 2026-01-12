require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const studentRoutes = require('./routes/studentRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection Logic
const connectDB = async () => {
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (mongoose.connection.readyState === 1) {
        return;
    }

    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in environment variables');
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        throw error;
    }
};

// Middleware to ensure DB is connected before handling requests
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error('Database connection failed for request:', error);
        res.status(503).json({ error: 'Service Unavailable: Database connection failed', details: error.message });
    }
});

// Routes
app.use('/api', studentRoutes);
app.use('/api', subjectRoutes);
app.use('/api', dashboardRoutes);

// Start Server
if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
            });
        })
        .catch(err => {
            console.error('Failed to start server:', err);
            // Even if DB fails, we might want to start server to at least show 503s or health checks,
            // but for this simple app, logging and exiting or just logging is fine.
            // We'll try to start anyway so Vercel doesn't kill the process immediately if it expects a bound port.
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT} (DB Connection Failed)`);
            });
        });
}

module.exports = app;
