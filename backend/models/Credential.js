const mongoose = require('mongoose');
const crypto = require('crypto');

// Simple encryption for stored passwords
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-encryption-key-change-me!';
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return '';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    if (!text) return '';
    try {
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encrypted = parts.join(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return '';
    }
}

const credentialSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
        required: true
    },
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    website: {
        type: String,
        trim: true,
        maxlength: [500, 'Website URL cannot exceed 500 characters']
    },
    username: {
        type: String,
        trim: true,
        maxlength: [200, 'Username cannot exceed 200 characters']
    },
    email: {
        type: String,
        trim: true,
        maxlength: [200, 'Email cannot exceed 200 characters']
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [2000, 'Notes cannot exceed 2000 characters']
    },
    category: {
        type: String,
        enum: ['App', 'Website', 'Server', 'Database', 'API', 'Email', 'Social Media', 'Cloud', 'Other'],
        default: 'App'
    },
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        default: null
    },
    project_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

credentialSchema.index({ category: 1 });
credentialSchema.index({ createdAt: -1 });
credentialSchema.index({ title: 'text', website: 'text', username: 'text' });

// Encrypt password before saving
credentialSchema.pre('save', function (next) {
    if (this.isModified('password') && this.password && !this.password.includes(':')) {
        this.password = encrypt(this.password);
    }
    next();
});

// Method to get decrypted password
credentialSchema.methods.getDecryptedPassword = function () {
    return decrypt(this.password);
};

// Static helper
credentialSchema.statics.encrypt = encrypt;
credentialSchema.statics.decrypt = decrypt;

module.exports = mongoose.model('Credential', credentialSchema);
