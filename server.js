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

// --- Security Middleware ---
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// Set security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 10 minutes'
});
app.use('/api', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50, // Increased for debugging (was 5)
    message: 'Too many login attempts, please try again after 10 minutes'
});
// Apply to specific auth routes if not already covered by general limiter or need stricter control
// Note: We need to apply this specifically to the auth route path if we want it to be separate.
// For simplicity, we can just apply generic limit or apply this after routes definition if routes were separate variables.
// Better: Apply directly to the auth path string before route mounting.
app.use('/api/auth/login', authLimiter);

// Data sanitization against NoSQL query injection
// app.use(mongoSanitize());

// Data sanitization against XSS
// app.use(xss());

// Prevent parameter pollution
// app.use(hpp());
// ---------------------------

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
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', studentRoutes);
app.use('/api', subjectRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/pos', require('./routes/posRoutes'));
app.use('/api', require('./routes/examRoutes'));

// Start Server
if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT} - v2.1`);
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
// Force nodemon restart
