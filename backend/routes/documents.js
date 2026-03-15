const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const stream = require('stream');
const Document = require('../models/Document');

// Initialize GridFS bucket lazily
let bucket;
const getBucket = () => {
    if (!bucket && mongoose.connection.readyState === 1) {
        bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'documents'
        });
    }
    return bucket;
};

// Configure multer storage
// Configure multer to use memory storage
const storage = multer.memoryStorage();

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

// POST /api/documents — Upload a new document to MongoDB
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const gfs = getBucket();
        if (!gfs) {
            return res.status(500).json({ error: 'Database connection not ready' });
        }

        const { title, description, category, tags } = req.body;
        const filename = `${Date.now()}-${req.file.originalname}`;

        // Create an upload stream to GridFS
        const uploadStream = gfs.openUploadStream(filename, {
            contentType: req.file.mimetype,
            metadata: {
                user: req.user._id,
                originalName: req.file.originalname
            }
        });

        // Convert buffer to stream and pipe to GridFS
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const fileUploadPromise = new Promise((resolve, reject) => {
            bufferStream.pipe(uploadStream)
                .on('error', reject)
                .on('finish', resolve);
        });

        await fileUploadPromise;

        const document = new Document({
            user: req.user._id,
            title: title || req.file.originalname,
            description: description || '',
            filename: filename,
            originalName: req.file.originalname,
            fileId: uploadStream.id, // Save the reference to GridFS file
            size: req.file.size,
            mimetype: req.file.mimetype,
            category: category || 'General',
            tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : []
        });

        await document.save();
        res.status(201).json({ document, message: 'Document uploaded successfully' });
    } catch (error) {
        console.error('Error uploading document:', error);
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

        // Delete from GridFS if fileId exists
        if (document.fileId) {
            const gfs = getBucket();
            if (gfs) {
                try {
                    await gfs.delete(new mongoose.Types.ObjectId(document.fileId));
                } catch (gfsErr) {
                    console.error('Error deleting from GridFS:', gfsErr);
                }
            }
        }

        // Keep fallback for legacy local files
        if (document.path) {
            if (fs.existsSync(document.path)) {
                fs.unlinkSync(document.path);
            }
        }

        await Document.deleteOne({ _id: document._id });
        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// GET /api/documents/:id/download — Download the file from MongoDB or Local
router.get('/:id/download', async (req, res) => {
    try {
        const document = await Document.findOne({ _id: req.params.id, user: req.user._id });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // 1. Try to download from GridFS if fileId exists
        if (document.fileId) {
            const gfs = getBucket();
            if (!gfs) {
                return res.status(500).json({ error: 'Database connection not ready' });
            }

            res.set('Content-Type', document.mimetype);
            res.set('Content-Disposition', `attachment; filename="${document.originalName}"`);

            const downloadStream = gfs.openDownloadStream(new mongoose.Types.ObjectId(document.fileId));

            downloadStream.on('error', (err) => {
                console.error('GridFS Download Stream Error:', err);
                // If GridFS fails, try to fall back to path if it exists
                if (document.path && fs.existsSync(document.path)) {
                    return res.download(document.path, document.originalName);
                }
                if (!res.headersSent) {
                    res.status(404).json({ error: 'File not found in storage' });
                }
            });

            return downloadStream.pipe(res);
        }

        // 2. Fallback to Local Storage for old documents
        if (document.path && fs.existsSync(document.path)) {
            return res.download(document.path, document.originalName);
        }

        // 3. Final attempt: search filesystem by name if path is broken
        const fallbackPath = path.join(process.cwd(), 'uploads/documents', document.filename);
        if (fs.existsSync(fallbackPath)) {
            return res.download(fallbackPath, document.originalName);
        }

        res.status(404).json({ error: 'File not found on server or database' });
    } catch (error) {
        console.error('Error downloading document:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

module.exports = router;
