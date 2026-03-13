const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
console.log("OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY ? "Loaded ✅" : "Missing ❌");

// Robustly load backend/.env regardless of CWD
(() => {
  const candidatePaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        break;
      }
    } catch (_) {
      // continue
    }
  }
})();
// Prefer typed env when compiled to JS
let envConfig;
try { envConfig = require('./config/env.ts').default; } catch (_) { envConfig = null; }

const app = express();
const PORT = (envConfig?.PORT) || process.env.PORT || 5000;

// Import routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const meetingRoutes = require('./routes/meetings');
const dashboardRoutes = require('./routes/dashboard');
const projectRoutes = require('./routes/projects');
const leadRoutes = require('./routes/leads');
const auth = require('./middleware/auth');
const chatbotRoutes = require('./routes/chatbot');
const documentRoutes = require('./routes/documents');
const noteRoutes = require('./routes/notes');
const credentialRoutes = require('./routes/credentials');

// Middleware
const allowedOrigins = [
  "https://responsive-737.pages.dev",
  "https://cliento.icu",
  "https://www.cliento.icu",
  "http://localhost:3000"  // for local development
];
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
mongoose.connect((envConfig?.MONGODB_URI) || process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
// Protect all resource routes with auth middleware
app.use('/api/clients', auth, clientRoutes);
app.use('/api/meetings', auth, meetingRoutes);
app.use('/api/dashboard', auth, dashboardRoutes);
app.use('/api/projects', auth, projectRoutes);
app.use('/api/leads', auth, leadRoutes);
app.use('/api/chatbot', auth, chatbotRoutes);
app.use('/api/documents', auth, documentRoutes);
app.use('/api/notes', auth, noteRoutes);
app.use('/api/credentials', auth, credentialRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SalesForge CRM API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.CORS_ORIGIN || 'https://www.cliento.icu'}`);
  // Keep legacy log but prefer CLIENT_URL above
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
});
