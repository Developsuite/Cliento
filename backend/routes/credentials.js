const express = require('express');
const router = express.Router();
const Credential = require('../models/Credential');

// GET /api/credentials — List all credentials
router.get('/', async (req, res) => {
    try {
        const { search, category } = req.query;
        const filter = { user: req.user._id };

        if (category && category !== 'all') {
            filter.category = category;
        }

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { website: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const credentials = await Credential.find(filter)
            .populate('client_id', 'name business_name')
            .populate('project_id', 'name')
            .sort({ createdAt: -1 });

        // Return credentials WITHOUT decrypted passwords (just metadata)
        const safe = credentials.map(c => ({
            ...c.toJSON(),
            password: '••••••••', // mask password in list view
            _hasPassword: true
        }));

        res.json({ credentials: safe });
    } catch (error) {
        console.error('Error fetching credentials:', error);
        res.status(500).json({ error: 'Failed to fetch credentials' });
    }
});

// POST /api/credentials — Create a new credential
router.post('/', async (req, res) => {
    try {
        const { title, website, username, email, password, notes, category, client_id, project_id } = req.body;

        if (!title || !password) {
            return res.status(400).json({ error: 'Title and password are required' });
        }

        const credential = new Credential({
            user: req.user._id,
            title,
            website: website || '',
            username: username || '',
            email: email || '',
            password,
            notes: notes || '',
            category: category || 'App',
            client_id: client_id || null,
            project_id: project_id || null
        });

        await credential.save();
        res.status(201).json({ credential: { ...credential.toJSON(), password: '••••••••' }, message: 'Credential saved successfully' });
    } catch (error) {
        console.error('Error saving credential:', error);
        res.status(500).json({ error: error.message || 'Failed to save credential' });
    }
});

// GET /api/credentials/:id — Get single credential (with decrypted password)
router.get('/:id', async (req, res) => {
    try {
        const credential = await Credential.findOne({ _id: req.params.id, user: req.user._id })
            .populate('client_id', 'name business_name')
            .populate('project_id', 'name');

        if (!credential) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        const result = credential.toJSON();
        result.password = credential.getDecryptedPassword();
        res.json({ credential: result });
    } catch (error) {
        console.error('Error fetching credential:', error);
        res.status(500).json({ error: 'Failed to fetch credential' });
    }
});

// PUT /api/credentials/:id — Update credential
router.put('/:id', async (req, res) => {
    try {
        const { title, website, username, email, password, notes, category, client_id, project_id } = req.body;
        const credential = await Credential.findOne({ _id: req.params.id, user: req.user._id });

        if (!credential) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        if (title) credential.title = title;
        if (website !== undefined) credential.website = website;
        if (username !== undefined) credential.username = username;
        if (email !== undefined) credential.email = email;
        if (password && password !== '••••••••') {
            credential.password = password; // will be encrypted by pre-save hook
        }
        if (notes !== undefined) credential.notes = notes;
        if (category) credential.category = category;
        if (client_id !== undefined) credential.client_id = client_id || null;
        if (project_id !== undefined) credential.project_id = project_id || null;

        await credential.save();
        res.json({ credential: { ...credential.toJSON(), password: '••••••••' }, message: 'Credential updated successfully' });
    } catch (error) {
        console.error('Error updating credential:', error);
        res.status(500).json({ error: error.message || 'Failed to update credential' });
    }
});

// DELETE /api/credentials/:id — Delete credential
router.delete('/:id', async (req, res) => {
    try {
        const credential = await Credential.findOne({ _id: req.params.id, user: req.user._id });

        if (!credential) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        await Credential.deleteOne({ _id: credential._id });
        res.json({ message: 'Credential deleted successfully' });
    } catch (error) {
        console.error('Error deleting credential:', error);
        res.status(500).json({ error: 'Failed to delete credential' });
    }
});

// POST /api/credentials/:id/reveal — Reveal decrypted password
router.post('/:id/reveal', async (req, res) => {
    try {
        const credential = await Credential.findOne({ _id: req.params.id, user: req.user._id });

        if (!credential) {
            return res.status(404).json({ error: 'Credential not found' });
        }

        res.json({ password: credential.getDecryptedPassword() });
    } catch (error) {
        console.error('Error revealing password:', error);
        res.status(500).json({ error: 'Failed to reveal password' });
    }
});

module.exports = router;
