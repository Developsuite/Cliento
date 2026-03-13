const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        required: true
    },
    title: {
        type: String,
        required: [true, 'Note title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Note content is required'],
        maxlength: [10000, 'Content cannot exceed 10000 characters']
    },
    category: {
        type: String,
        enum: ['General', 'Important', 'Meeting', 'Todo', 'Idea', 'Other'],
        default: 'General'
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    color: {
        type: String,
        enum: ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'],
        default: 'default'
    },
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

noteSchema.index({ isPinned: -1, updatedAt: -1 });
noteSchema.index({ category: 1 });
noteSchema.index({ createdAt: -1 });
noteSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Note', noteSchema);
