const Subject = require('../models/Subject');

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
        const { name, description, classDay, color } = req.body;
        if (!name || !classDay) return res.status(400).json({ message: 'Name and Class Day are required' });

        const existing = await Subject.findOne({ name });
        if (existing) return res.status(400).json({ message: 'Subject already exists' });

        const subject = new Subject({ name, description, classDay, color });
        await subject.save();
        res.status(201).json(subject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
