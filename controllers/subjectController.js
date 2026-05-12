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
        const { name, description, color, fee } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });

        const existing = await Subject.findOne({ name });
        if (existing) return res.status(400).json({ message: 'Subject already exists' });

        const subject = new Subject({ name, description, color, fee: fee || 0 });
        await subject.save();
        res.status(201).json(subject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateSubject = async (req, res) => {
    try {
        const { subjectName } = req.params;
        const updates = req.body;

        const subject = await Subject.findOneAndUpdate({ name: subjectName }, updates, { new: true });

        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        res.json(subject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
