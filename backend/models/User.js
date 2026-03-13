const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  avatar: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  vaultPassword: {
    type: String,
    select: false
  },
  hasVaultPassword: {
    type: Boolean,
    default: false
  },
  vaultSecurityQuestion: {
    type: String,
    select: false
  },
  vaultSecurityAnswer: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
    if (this.isModified('vaultPassword')) {
      const salt = await bcrypt.genSalt(12);
      this.vaultPassword = await bcrypt.hash(this.vaultPassword, salt);
    }
    if (this.isModified('vaultSecurityAnswer')) {
      const salt = await bcrypt.genSalt(12);
      this.vaultSecurityAnswer = await bcrypt.hash(this.vaultSecurityAnswer.toLowerCase(), salt);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Compare vault password method
userSchema.methods.compareVaultPassword = async function (candidatePassword) {
  if (!this.vaultPassword) return false;
  return await bcrypt.compare(candidatePassword, this.vaultPassword);
};

// Compare vault security answer method
userSchema.methods.compareVaultAnswer = async function (candidateAnswer) {
  if (!this.vaultSecurityAnswer) return false;
  return await bcrypt.compare(candidateAnswer.toLowerCase(), this.vaultSecurityAnswer);
};

// Create password reset token (hashed in DB, raw token returned)
userSchema.methods.createPasswordResetToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  this.passwordResetToken = hashedToken;
  this.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

  return rawToken;
};

userSchema.add({
  passwordResetToken: { type: String, index: true },
  passwordResetExpires: Date
});

module.exports = mongoose.model('User', userSchema);
