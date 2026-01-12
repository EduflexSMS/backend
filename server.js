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

// Routes
app.use('/api', studentRoutes);
app.use('/api', subjectRoutes);
app.use('/api', dashboardRoutes);


// Database Connection
let isConnected = false;

const connectDB = async (retries = 5, delay = 3000) => {
    if (isConnected) return;
    if (!MONGODB_URI) {
        console.error('MONGODB_URI is not set. Exiting.');
        process.exit(1);
    }

    const options = {
        // Fail faster when the server is not reachable
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
    };

    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(MONGODB_URI, options);
            isConnected = true;
            console.log('Connected to MongoDB');
            return;
        } catch (err) {
            console.error(`MongoDB connection attempt ${i + 1} failed:`, err.message);
            if (i < retries - 1) {
                await new Promise((res) => setTimeout(res, delay));
                delay *= 2; // exponential back off
            } else {
                console.error('All MongoDB connection attempts failed');
            }
        }
    }
};

// Middleware to ensure DB is connected before handling requests
app.use((req, res, next) => {
    if (!isConnected) {
        // Try connecting in background (do not block requests for long)
        connectDB().catch(() => {});
        return res.status(503).json({ error: 'Service unavailable: database not connected' });
    }
    next();
});

// Start Server
if (require.main === module) {
    // Attempt initial DB connection, but still start the server to avoid blocking deploys.
    connectDB().finally(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}` + (isConnected ? '' : ' (DB not connected)'));
        });
    });
}

module.exports = app;
