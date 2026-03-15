const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: function (req, file, cb) {
        // Allow common document types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/zip',
            'application/x-rar-compressed',
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed. Supported: PDF, Word, Excel, PowerPoint, Text, CSV, Images, ZIP, RAR'));
        }
    }
});

// GET /api/documents — List all documents
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
                { originalName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const documents = await Document.find(filter).sort({ createdAt: -1 });
        res.json({ documents });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// POST /api/documents — Upload a new document
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { title, description, category, tags } = req.body;

        const document = new Document({
            user: req.user._id,
            title: title || req.file.originalname,
            description: description || '',
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: `uploads/documents/${req.file.filename}`,
            size: req.file.size,
            mimetype: req.file.mimetype,
            category: category || 'General',
            tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : []
        });

        await document.save();
        res.status(201).json({ document, message: 'Document uploaded successfully' });
    } catch (error) {
        console.error('Error uploading document:', error);
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message || 'Failed to upload document' });
    }
});

// GET /api/documents/:id — Get single document
router.get('/:id', async (req, res) => {
    try {
        const document = await Document.findOne({ _id: req.params.id, user: req.user._id });
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json({ document });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// PUT /api/documents/:id — Update document metadata
router.put('/:id', async (req, res) => {
    try {
        const { title, description, category, tags } = req.body;
        const document = await Document.findOne({ _id: req.params.id, user: req.user._id });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        if (title) document.title = title;
        if (description !== undefined) document.description = description;
        if (category) document.category = category;
        if (tags) document.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;

        await document.save();
        res.json({ document, message: 'Document updated successfully' });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ error: error.message || 'Failed to update document' });
    }
});

// DELETE /api/documents/:id — Delete document + file
router.delete('/:id', async (req, res) => {
    try {
        const document = await Document.findOne({ _id: req.params.id, user: req.user._id });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Remove file from disk
        const filePath = document.path;
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        } else {
            // Fallback for absolute paths or mismatched relative paths
            const filename = document.filename;
            const fallbackPath = path.join(process.cwd(), 'uploads/documents', filename);
            if (fs.existsSync(fallbackPath)) {
                fs.unlinkSync(fallbackPath);
            }
        }

        await Document.deleteOne({ _id: document._id });
        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// GET /api/documents/:id/download — Download the file
router.get('/:id/download', async (req, res) => {
    try {
        const document = await Document.findOne({ _id: req.params.id, user: req.user._id });

        if (!document) {
            console.error(`[DownloadDoc] Document not found: ${req.params.id} for user ${req.user._id}`);
            return res.status(404).json({ error: 'Document not found' });
        }

        let filePath = document.path;

        // If the path is absolute or doesn't exist, try to find it in the current uploads directory
        if (!fs.existsSync(filePath)) {
            const filename = document.filename || path.basename(filePath);
            const fallbackPath = path.join(process.cwd(), 'uploads/documents', filename);

            if (fs.existsSync(fallbackPath)) {
                filePath = fallbackPath;
            } else {
                // Try one more: relative to backend folder if not already
                const secondFallback = path.join(__dirname, '../uploads/documents', filename);
                if (fs.existsSync(secondFallback)) {
                    filePath = secondFallback;
                } else {
                    console.error(`[DownloadDoc] File not found. Tried: ${document.path} and ${fallbackPath}`);
                    return res.status(404).json({ error: 'File not found on server' });
                }
            }
        }

        res.download(filePath, document.originalName);
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

module.exports = router;
