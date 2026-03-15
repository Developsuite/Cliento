const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const crypto = require('crypto');

// Validation middleware
const validateSignup = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const validateEmailOnly = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email')
];

const validateResetPassword = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
];

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '7d'
  });
};

// POST /api/auth/signup
router.post('/signup', validateSignup, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'User created successfully',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST /api/auth/forgot-password -> generate reset token and (normally) email it
router.post('/forgot-password', validateEmailOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      // For security, respond success even if user not found
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // In production, send via email. For now, return the token for testing.
    res.json({ message: 'Password reset token generated', token: rawToken });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password -> verify token and set new password
router.post('/reset-password', validateResetPassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/profile - Get current user profile
router.get('/profile', async (req, res) => {
  try {
    // This will be protected by middleware later
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Profile fetch error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Vault Routes

// GET /api/auth/vault/status - Get vault setup status and security question
router.get('/vault/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('+vaultSecurityQuestion +hasVaultPassword');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      hasVaultPassword: user.hasVaultPassword,
      securityQuestion: user.vaultSecurityQuestion || null
    });
  } catch (error) {
    console.error('Vault status error:', error);
    res.status(500).json({ error: 'Failed to check vault status' });
  }
});

// POST /api/auth/vault/setup - Create initial vault password and secret question
router.post('/vault/setup', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { vaultPassword, securityQuestion, securityAnswer } = req.body;

    if (!vaultPassword || !securityQuestion || !securityAnswer) {
      return res.status(400).json({ error: 'Password, security question, and answer are all required' });
    }

    // Force overwrite corrupted or old passwords
    user.vaultPassword = vaultPassword;
    user.vaultSecurityQuestion = securityQuestion;
    user.vaultSecurityAnswer = securityAnswer;
    user.hasVaultPassword = true;

    // We explicitly mark these paths as modified so the pre-save hook catches them
    user.markModified('vaultPassword');
    user.markModified('vaultSecurityQuestion');
    user.markModified('vaultSecurityAnswer');
    user.markModified('hasVaultPassword');

    await user.save();

    res.json({ message: 'Vault initialized successfully' });
  } catch (error) {
    console.error('Vault setup error:', error);
    res.status(500).json({ error: 'Failed to setup vault' });
  }
});

// POST /api/auth/vault/reset - Clear vault password (requires main account password verification)
router.post('/vault/reset', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const { accountPassword } = req.body;
    if (!accountPassword) {
      return res.status(400).json({ error: 'Account password is required to reset vault' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('+password +vaultPassword +vaultSecurityAnswer');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify main account password
    const isMainPasswordValid = await user.comparePassword(accountPassword);
    if (!isMainPasswordValid) {
      return res.status(401).json({ error: 'Invalid account password. Vault reset denied.' });
    }

    user.vaultPassword = undefined;
    user.vaultSecurityQuestion = undefined;
    user.vaultSecurityAnswer = undefined;
    user.hasVaultPassword = false;

    // Explicitly mark modified
    user.markModified('vaultPassword');
    user.markModified('vaultSecurityQuestion');
    user.markModified('vaultSecurityAnswer');
    user.markModified('hasVaultPassword');

    await user.save();

    res.json({ message: 'Vault reset successfully. You can now set it up again.' });
  } catch (error) {
    console.error('Vault reset error:', error);
    res.status(500).json({ error: 'Failed to reset vault' });
  }
});

// POST /api/auth/vault/unlock - Unlock vault via password OR security answer
router.post('/vault/unlock', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('+vaultPassword +vaultSecurityAnswer +hasVaultPassword');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.hasVaultPassword) {
      return res.status(400).json({ error: 'Vault has not been set up yet' });
    }

    const { vaultPassword, securityAnswer, accountPassword } = req.body;

    let isUnlocked = false;

    // Case 1: Standard Unlock with Master Password
    if (vaultPassword && !securityAnswer) {
      isUnlocked = await user.compareVaultPassword(vaultPassword);
    }
    // Case 2: Recovery Unlock with Security Answer (NOW REQUIRES Account Password for safety)
    else if (securityAnswer && !vaultPassword) {
      if (!accountPassword) {
        return res.status(400).json({ error: 'Main account password is required for vault recovery' });
      }

      const isAccountPwValid = await user.comparePassword(accountPassword);
      if (!isAccountPwValid) {
        return res.status(401).json({ error: 'Invalid account password' });
      }

      isUnlocked = await user.compareVaultAnswer(securityAnswer);
    }
    else {
      return res.status(400).json({ error: 'Must provide either vault password or security answer' });
    }

    if (!isUnlocked) {
      return res.status(401).json({ error: 'Invalid vault password or security answer' });
    }

    res.json({ message: 'Vault unlocked successfully', success: true });
  } catch (error) {
    console.error('Vault unlock error:', error);
    res.status(500).json({ error: 'Failed to unlock vault' });
  }
});

module.exports = router;
