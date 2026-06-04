const User = require('../models/User');
const Subject = require('../models/Subject'); // Ensure Subject is imported
const jwt = require('jsonwebtoken');

exports.seedTeachers = async (req, res) => {
    try {
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
                subjectName: "Business and Accounting Studies",
                username: "Danushpa C Rajapaksha",
                role: "teacher",
                image: "/teachers/danushpa.jpg",
                description: "Bsc Business Management SP"
            },
            {
                subjectName: "Grade 05 Scholarship", // Matched with DB
                username: "Ravindra Sirimanna",
                role: "teacher",
                image: "/teachers/ravindra.jpg",
                description: "Government National School Teacher"
            }
        ];

        let results = [];

        for (const data of teacherData) {
            const subject = await Subject.findOne({ name: data.subjectName });

            if (!subject) {
                results.push(`Warning: Subject '${data.subjectName}' not found.`);
                continue;
            }

            const userExists = await User.findOne({ username: data.username });
            if (!userExists) {
                await User.create({
                    username: data.username,
                    password: 'password',
                    role: 'teacher',
                    assignedSubject: subject.name,
                    image: data.image,
                    description: data.description
                });
                results.push(`Created: ${data.username}`);
            } else {
                userExists.assignedSubject = subject.name;
                userExists.role = 'teacher';
                userExists.image = data.image;
                userExists.description = data.description;
                await userExists.save();
                results.push(`Updated: ${data.username}`);
            }
        }


        // Cleanup: Remove teachers not in the list
        const allowedUsernames = teacherData.map(t => t.username);
        const cleanupResult = await User.deleteMany({
            role: 'teacher',
            username: { $nin: allowedUsernames }
        });

        if (cleanupResult.deletedCount > 0) {
            results.push(`Cleaned up ${cleanupResult.deletedCount} old teacher accounts.`);
        }

        res.json({ message: "Seeding Complete", details: results });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
        expiresIn: '30d',
    });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        const user = await User.findOne({ username });

        if (user && (await user.matchPassword(password))) {
            // Strict Role Check
            if (role && user.role !== role) {
                return res.status(403).json({
                    message: `Access Denied: You cannot login as ${role} with a ${user.role} account.`
                });
            }

            res.json({
                _id: user._id,
                username: user.username,
                role: user.role,
                assignedSubject: user.assignedSubject,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid username or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Register a new user (Admin)
// @route   POST /api/auth/register
// @access  Public (Should be protected or removed in production after initial setup)
exports.registerUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        const userExists = await User.findOne({ username });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            username,
            password,
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Create a new teacher account (Admin only)
// @route   POST /api/auth/create-teacher
// @access  Private (Admin)
exports.createTeacher = async (req, res) => {
    try {
        const { username, password, assignedSubject, description, image } = req.body;

        if (!username || !password || !assignedSubject) {
            return res.status(400).json({ message: 'Username, password, and assigned subject are required' });
        }

        const userExists = await User.findOne({ username });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Enforce teacher role
        const user = await User.create({
            username,
            password,
            role: 'teacher',
            assignedSubject,
            description: description || '',
            image: image || ''
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                role: user.role,
                assignedSubject: user.assignedSubject,
                description: user.description,
                image: user.image
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a teacher account (Admin only)
// @route   PUT /api/auth/teachers/:id
// @access  Private (Admin)
exports.updateTeacher = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, assignedSubject, description, image } = req.body;

        const teacher = await User.findById(id);
        if (!teacher || teacher.role !== 'teacher') {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        if (username) teacher.username = username;
        if (assignedSubject) teacher.assignedSubject = assignedSubject;
        if (description !== undefined) teacher.description = description;
        if (image !== undefined) teacher.image = image;
        if (password) {
            teacher.password = password; // mongoose schema hook handles hashing on save
        }

        await teacher.save();
        res.json({
            _id: teacher._id,
            username: teacher.username,
            role: teacher.role,
            assignedSubject: teacher.assignedSubject,
            description: teacher.description,
            image: teacher.image
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a teacher account (Admin only)
// @route   DELETE /api/auth/teachers/:id
// @access  Private (Admin)
exports.deleteTeacher = async (req, res) => {
    try {
        const { id } = req.params;
        const teacher = await User.findOneAndDelete({ _id: id, role: 'teacher' });
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all teachers
// @route   GET /api/auth/teachers
// @access  Public
exports.getTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('-password');
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

