require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Subject = require('./models/Subject');

const teacherData = [
    {
        subjectName: "Mathematics",
        username: "Keshara Rathnayaka",
        role: "teacher",
        image: "/teachers/keshara.jpg",
        description: "Software Engineering(Hons)"
    },
    {
        subjectName: "Science",
        username: "Yasiru Hasaranga",
        role: "teacher",
        image: "/teachers/yasiru.jpg",
        description: "National Diploma in Teaching(Science)"
    },
    {
        subjectName: "English",
        username: "Malith Jyawardhana",
        role: "teacher",
        image: "/teachers/malith.jpg",
        description: "Diploma in English"
    },
    {
        subjectName: "ICT",
        username: "Nilushka Purnima",
        role: "teacher",
        image: "/teachers/nilushka.jpg",
        description: "Software Engineering(Hons)"
    },
    {
        subjectName: "Business & Accounting Studies",
        username: "Danushpa C Rajapaksha",
        role: "teacher",
        image: "/teachers/danushpa.jpg",
        description: "Bsc Business Management SP"
    },
    {
        subjectName: "Grade 03-05 Scholarship",
        username: "Ravindra Sirimanna",
        role: "teacher",
        image: "", // No photo yet
        description: "Government National School Teacher"
    }
];

const seedTeachers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Verify subjects exist
        for (const data of teacherData) {
            const subject = await Subject.findOne({ name: data.subjectName });

            if (!subject) {
                // Try partial match if exact match fails, or warn
                console.log(`Warning: Subject '${data.subjectName}' not found in DB. Skipping teacher ${data.username}.`);
                continue;
            }

            // Check if teacher exists by username
            const userExists = await User.findOne({ username: data.username });
            if (!userExists) {
                await User.create({
                    username: data.username,
                    password: 'password', // Default password
                    role: 'teacher',
                    assignedSubject: subject.name,
                    image: data.image,
                    description: data.description
                });
                console.log(`Created: ${data.username} for ${subject.name}`);
            } else {
                console.log(`Updating: ${data.username}`);
                userExists.assignedSubject = subject.name;
                userExists.role = 'teacher';
                userExists.image = data.image;
                userExists.description = data.description;
                await userExists.save();
            }
        }

        console.log('Teacher seeding complete.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

seedTeachers();
