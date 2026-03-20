const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const adminExists = await User.findOne({ username: 'admin' });

        if (adminExists) {
            console.log('Admin user already exists');
        } else {
            const admin = new User({
                username: 'admin',
                password: 'password123', // Default password
                role: 'admin'
            });
            await admin.save();
            console.log('Admin user created successfully');
            console.log('Username: admin');
            console.log('Password: password123');
        }
        process.exit();
    } catch (error) {
        console.error("SEED ERROR:", error);
        const fs = require('fs');
        fs.writeFileSync('seed_error.log', error.toString());
        process.exit(1);
    }
};

createAdmin();
