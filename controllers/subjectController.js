const Subject = require('../models/Subject');
const User = require('../models/User');
const Student = require('../models/Student');

exports.getAllSubjects = async (req, res) => {
    try {
        const subjects = await Subject.find();
        res.json(subjects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createSubject = async (req, res) => {
    try {
        const { name, description, color, fee, feeType, classDaysCount, teacherName, teacherDescription, teacherImage } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });

        const existing = await Subject.findOne({ name });
        if (existing) return res.status(400).json({ message: 'Subject already exists' });

        const subject = new Subject({ 
            name, 
            description, 
            color, 
            fee: fee || 0, 
            feeType: feeType || 'monthly',
            classDaysCount: classDaysCount || 5
        });
        await subject.save();

        // Create or update teacher if teacherName is provided
        if (teacherName) {
            const userExists = await User.findOne({ username: teacherName });
            if (!userExists) {
                await User.create({
                    username: teacherName,
                    password: 'password', // Default password
                    role: 'teacher',
                    assignedSubject: subject.name,
                    description: teacherDescription || '',
                    image: teacherImage || ''
                });
            } else {
                userExists.assignedSubject = subject.name;
                if (teacherDescription !== undefined) userExists.description = teacherDescription;
                if (teacherImage !== undefined) userExists.image = teacherImage;
                await userExists.save();
            }
        }

        res.status(201).json(subject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateSubject = async (req, res) => {
    try {
        const { subjectName } = req.params;
        const { name, description, color, fee, feeType, classDaysCount, gradeSchedules, teacherName, teacherDescription, teacherImage } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (color !== undefined) updateData.color = color;
        if (fee !== undefined) updateData.fee = fee;
        if (feeType !== undefined) updateData.feeType = feeType;
        if (classDaysCount !== undefined) updateData.classDaysCount = classDaysCount;
        if (gradeSchedules !== undefined) updateData.gradeSchedules = gradeSchedules;

        const subject = await Subject.findOneAndUpdate({ name: subjectName }, updateData, { new: true });

        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        // Cascade rename assignedSubject for teachers and student enrollments
        if (name && name !== subjectName) {
            await User.updateMany(
                { role: 'teacher', assignedSubject: subjectName },
                { assignedSubject: name }
            );

            await Student.updateMany(
                { "enrollments.subject": subjectName },
                { "$set": { "enrollments.$[elem].subject": name } },
                { arrayFilters: [{ "elem.subject": subjectName }] }
            );
        }

        // Update teacher if teacherName is provided
        if (teacherName) {
            const userExists = await User.findOne({ username: teacherName });
            if (!userExists) {
                await User.create({
                    username: teacherName,
                    password: 'password',
                    role: 'teacher',
                    assignedSubject: subject.name,
                    description: teacherDescription || '',
                    image: teacherImage || ''
                });
            } else {
                userExists.assignedSubject = subject.name;
                if (teacherDescription !== undefined) userExists.description = teacherDescription;
                if (teacherImage !== undefined) userExists.image = teacherImage;
                await userExists.save();
            }
        }

        res.json(subject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteSubject = async (req, res) => {
    try {
        const { subjectName } = req.params;
        const subject = await Subject.findOneAndDelete({ name: subjectName });

        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }

        // Unlink teachers
        await User.updateMany(
            { role: 'teacher', assignedSubject: subjectName },
            { $unset: { assignedSubject: "" } }
        );

        // Remove enrollments from students
        await Student.updateMany(
            {},
            { $pull: { enrollments: { subject: subjectName } } }
        );

        res.json({ message: 'Subject deleted successfully', subjectName });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
