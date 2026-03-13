const express = require('express');
const router = express.Router();
const Note = require('../models/Note');

// GET /api/notes — List all notes (pinned first)
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
                { content: { $regex: search, $options: 'i' } }
            ];
        }

        const notes = await Note.find(filter).sort({ isPinned: -1, updatedAt: -1 });
        res.json({ notes });
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

// POST /api/notes — Create a new note
router.post('/', async (req, res) => {
    try {
        const { title, content, category, color, tags } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const note = new Note({
            user: req.user._id,
            title,
            content,
            category: category || 'General',
            color: color || 'default',
            tags: tags || []
        });

        await note.save();
        res.status(201).json({ note, message: 'Note created successfully' });
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ error: error.message || 'Failed to create note' });
    }
});

// GET /api/notes/:id — Get single note
router.get('/:id', async (req, res) => {
    try {
        const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ note });
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).json({ error: 'Failed to fetch note' });
    }
});

// PUT /api/notes/:id — Update note
router.put('/:id', async (req, res) => {
    try {
        const { title, content, category, color, tags } = req.body;
        const note = await Note.findOne({ _id: req.params.id, user: req.user._id });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        if (title) note.title = title;
        if (content !== undefined) note.content = content;
        if (category) note.category = category;
        if (color) note.color = color;
        if (tags) note.tags = tags;

        await note.save();
        res.json({ note, message: 'Note updated successfully' });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ error: error.message || 'Failed to update note' });
    }
});

// DELETE /api/notes/:id — Delete note
router.delete('/:id', async (req, res) => {
    try {
        const note = await Note.findOne({ _id: req.params.id, user: req.user._id });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        await Note.deleteOne({ _id: note._id });
        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// PATCH /api/notes/:id/pin — Toggle pin status
router.patch('/:id/pin', async (req, res) => {
    try {
        const note = await Note.findOne({ _id: req.params.id, user: req.user._id });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        note.isPinned = !note.isPinned;
        await note.save();
        res.json({ note, message: note.isPinned ? 'Note pinned' : 'Note unpinned' });
    } catch (error) {
        console.error('Error toggling pin:', error);
        res.status(500).json({ error: 'Failed to toggle pin status' });
    }
});

module.exports = router;
