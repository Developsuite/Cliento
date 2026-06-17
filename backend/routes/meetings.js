const express = require('express');
const { body, validationResult } = require('express-validator');
const Meeting = require('../models/Meeting');
const Client = require('../models/Client');
const router = express.Router();

// Auth middleware already applied by server.ts, so req.user should be set
// Just ensure we have a user id for all operations
router.use((req, res, next) => {
  console.log('[meetings_auth] Auth guard running...');
  console.log('[meetings_auth] req.user:', req.user);
  console.log('[meetings_auth] req.headers.authorization present:', Boolean(req.headers && req.headers.authorization));
  
  // Check for both id and _id fields for maximum compatibility
  const uid = req.user && (req.user.id || req.user._id);
  if (!uid) {
    console.error('[meetings_auth] req.user missing after auth middleware:', req.user);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  console.log('[meetings_auth] User ID found:', uid);
  // Normalize the user ID for downstream use
  req.user.id = uid;
  req.user._id = uid;
  next();
});

// Validation middleware
const validateMeeting = [
  body('client_id').optional({ checkFalsy: true }).isMongoId().withMessage('Valid client ID is required'),
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('date').custom((value) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }
    return true;
  }).withMessage('Valid date is required'),
  body('time').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time format required (HH:MM)'),
  body('duration').optional().isInt({ min: 15, max: 480 }).withMessage('Duration must be between 15 and 480 minutes'),
  body('type').optional().isIn(['Initial Consultation', 'Follow-up', 'Pitch', 'Demo', 'Negotiation', 'Closing', 'Other']).withMessage('Invalid meeting type'),
  body('status').optional().isIn(['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled']).withMessage('Invalid status'),
  body('location').optional().trim().isLength({ max: 500 }).withMessage('Location must be less than 500 characters'),
  body('notes').optional().trim().isLength({ max: 2000 }).withMessage('Notes must be less than 2000 characters'),
  body('agenda').optional().isArray().withMessage('Agenda must be an array'),
  body('attendees').optional().isArray().withMessage('Attendees must be an array'),
  body('reminder.enabled').optional().isBoolean().withMessage('Reminder enabled must be a boolean'),
  body('reminder.minutes_before').optional().isInt({ min: 1, max: 1440 }).withMessage('Reminder must be between 1 and 1440 minutes'),
  body('outcome').optional().isIn(['Successful', 'Needs Follow-up', 'Rescheduled', 'Cancelled', 'No Show']).withMessage('Invalid outcome'),
  body('follow_up_required').optional().isBoolean().withMessage('Follow-up required must be a boolean'),
  body('follow_up_date').optional().custom((value) => {
    if (!value) return true;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid follow-up date format');
    }
    return true;
  }).withMessage('Valid follow-up date required'),
  body('follow_up_notes').optional().trim().isLength({ max: 1000 }).withMessage('Follow-up notes must be less than 1000 characters')
];

// Test endpoint to verify authentication
router.get('/test-auth', (req, res) => {
  console.log('[meetings_test] Test auth endpoint hit');
  console.log('[meetings_test] req.user:', req.user);
  console.log('[meetings_test] req.headers:', req.headers);
  
  if (req.user && (req.user.id || req.user._id)) {
    res.json({ 
      message: 'Authentication working', 
      user: req.user,
      userId: req.user.id || req.user._id
    });
  } else {
    res.status(401).json({ 
      error: 'Authentication failed', 
      user: req.user,
      headers: req.headers
    });
  }
});

// GET all meetings with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      client_id, 
      status, 
      type, 
      date_from, 
      date_to, 
      page = 1, 
      limit = 20, 
      sortBy = 'date', 
      sortOrder = 'asc' 
    } = req.query;
    
    // Build query scoped to current user
    let query = { user: req.user.id };
    
    if (client_id) {
      query.client_id = client_id;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (type && type !== 'all') {
      query.type = type;
    }
    
    if (date_from || date_to) {
      query.date = {};
      if (date_from) query.date.$gte = new Date(date_from);
      if (date_to) query.date.$lte = new Date(date_to);
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const meetings = await Meeting.find(query)
      .populate('client_id', 'name business_name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count for pagination
    const total = await Meeting.countDocuments(query);
    
    res.json({
      meetings,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
        hasNext: skip + meetings.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// GET single meeting by ID
router.get('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, user: req.user.id })
      .populate('client_id', 'name business_name email phone address');
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json(meeting);
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// POST create new meeting
router.post('/', validateMeeting, async (req, res) => {
  try {
    console.log('[meetings_create] Starting meeting creation...');
    console.log('[meetings_create] req.user:', req.user);
    console.log('[meetings_create] req.body:', req.body);
    
    const currentUserId = req.user.id;
    if (!currentUserId) {
      console.error('[meetings_create] Could not resolve currentUserId');
      return res.status(401).json({ error: 'Access token required' });
    }
    
    console.log('[meetings_create] currentUserId:', currentUserId);
    
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[meetings_create] Validation errors:', errors.array());
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    console.log('[meetings_create] Validation passed, checking client...');
    
    // Check if client exists and belongs to current user (if provided)
    if (req.body.client_id) {
      const client = await Client.findOne({ _id: req.body.client_id, user: currentUserId });
      if (!client) {
        console.log('[meetings_create] Client not found for:', req.body.client_id, 'user:', currentUserId);
        return res.status(400).json({ error: 'Client not found' });
      }
      console.log('[meetings_create] Client found:', client.name);
    }
    
    // Check if meeting datetime is in the past (combine date + time)
    const { date, time } = req.body;
    const baseDate = new Date(date);
    const meetingDateTime = new Date(baseDate);
    if (typeof time === 'string' && time.includes(':')) {
      const [h, m] = time.split(':');
      meetingDateTime.setHours(parseInt(h), parseInt(m), 0, 0);
    }
    if (meetingDateTime < new Date()) {
      console.log('[meetings_create] Meeting datetime in past:', meetingDateTime);
      return res.status(400).json({ error: 'Meeting datetime cannot be in the past' });
    }
    
    console.log('[meetings_create] Creating meeting with data:', { ...req.body, user: currentUserId });
    
    const meeting = new Meeting({ ...req.body, user: currentUserId });
    console.info('[meetings_create] Meeting instance created, saving...');
    
    await meeting.save();
    console.log('[meetings_create] Meeting saved successfully');
    
    // Populate client info for response
    await meeting.populate('client_id', 'name business_name email');
    console.log('[meetings_create] Client populated, sending response');
    
    res.status(201).json({
      message: 'Meeting scheduled successfully',
      meeting
    });
    
  } catch (error) {
    console.error('Error creating meeting:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// PUT update meeting
router.put('/:id', validateMeeting, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { id } = req.params;
    
    // Check if meeting exists
    const existingMeeting = await Meeting.findOne({ _id: id, user: req.user.id });
    if (!existingMeeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    // Check if client exists
    if (req.body.client_id) {
      const client = await Client.findOne({ _id: req.body.client_id, user: req.user.id });
      if (!client) {
        return res.status(400).json({ error: 'Client not found' });
      }
    }
    
    // Check if meeting datetime is in the past (combine date + time)
    if (req.body.date || req.body.time) {
      const date = req.body.date ? new Date(req.body.date) : existingMeeting.date;
      const time = req.body.time || existingMeeting.time;
      const meetingDateTime = new Date(date);
      if (typeof time === 'string' && time.includes(':')) {
        const [h, m] = time.split(':');
        meetingDateTime.setHours(parseInt(h), parseInt(m), 0, 0);
      }
      if (meetingDateTime < new Date()) {
        return res.status(400).json({ error: 'Meeting datetime cannot be in the past' });
      }
    }
    
    const meeting = await Meeting.findOneAndUpdate(
      { _id: id, user: req.user.id },
      req.body,
      { new: true, runValidators: true }
    ).populate('client_id', 'name business_name email');
    
    res.json({
      message: 'Meeting updated successfully',
      meeting
    });
    
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// DELETE meeting
router.delete('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json({
      message: 'Meeting deleted successfully',
      meeting
    });
    
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// PATCH update meeting status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { status },
      { new: true }
    ).populate('client_id', 'name business_name email');
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json({
      message: 'Meeting status updated successfully',
      meeting
    });
    
  } catch (error) {
    console.error('Error updating meeting status:', error);
    res.status(500).json({ error: 'Failed to update meeting status' });
  }
});

// PATCH reschedule meeting
router.patch('/:id/reschedule', async (req, res) => {
  try {
    const { date, time } = req.body;
    
    if (!date || !time) {
      return res.status(400).json({ error: 'Date and time are required' });
    }
    
    // Check if new datetime is in the past (combine date + time)
    const newDate = new Date(date);
    const newDateTime = new Date(newDate);
    if (typeof time === 'string' && time.includes(':')) {
      const [h, m] = time.split(':');
      newDateTime.setHours(parseInt(h), parseInt(m), 0, 0);
    }
    if (newDateTime < new Date()) {
      return res.status(400).json({ error: 'Meeting datetime cannot be in the past' });
    }
    
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { date: newDate, time, status: 'Rescheduled' },
      { new: true }
    ).populate('client_id', 'name business_name email');
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json({
      message: 'Meeting rescheduled successfully',
      meeting
    });
    
  } catch (error) {
    console.error('Error rescheduling meeting:', error);
    res.status(500).json({ error: 'Failed to reschedule meeting' });
  }
});

// GET upcoming meetings
router.get('/upcoming/list', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const meetings = await Meeting.find({
      user: req.user.id,
      date: { $gte: new Date() },
      status: { $in: ['Scheduled', 'Confirmed'] }
    })
    .populate('client_id', 'name business_name email')
    .sort({ date: 1, time: 1 })
    .limit(parseInt(limit))
    .lean();
    
    res.json(meetings);
    
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming meetings' });
  }
});

// GET meetings by client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Check if client exists
    const client = await Client.findOne({ _id: clientId, user: req.user.id });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const meetings = await Meeting.find({ client_id: clientId, user: req.user.id })
      .sort({ date: -1, time: -1 })
      .lean();
    
    res.json(meetings);
    
  } catch (error) {
    console.error('Error fetching client meetings:', error);
    res.status(500).json({ error: 'Failed to fetch client meetings' });
  }
});

// GET meeting statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const stats = await Meeting.aggregate([
      {
        $match: { user: req.user.id }
      },
      {
        $facet: {
          statusBreakdown: [ { $group: { _id: '$status', count: { $sum: 1 } } } ],
          typeBreakdown: [ { $group: { _id: '$type', count: { $sum: 1 } } } ],
          monthlyMeetings: [ { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } }, { $group: { _id: null, count: { $sum: 1 } } } ],
          upcomingMeetings: [ { $match: { date: { $gte: today }, status: { $in: ['Scheduled', 'Confirmed'] } } }, { $group: { _id: null, count: { $sum: 1 } } } ]
        }
      }
    ]);
    
    const totalMeetings = await Meeting.countDocuments({ user: req.user.id });
    
    const statusBreakdown = {};
    stats[0].statusBreakdown.forEach(stat => {
      statusBreakdown[stat._id] = stat.count;
    });
    
    const typeBreakdown = {};
    stats[0].typeBreakdown.forEach(stat => {
      typeBreakdown[stat._id] = stat.count;
    });
    
    res.json({
      total_meetings: totalMeetings,
      monthly_meetings: stats[0].monthlyMeetings[0]?.count || 0,
      upcoming_meetings: stats[0].upcomingMeetings[0]?.count || 0,
      status_breakdown: statusBreakdown,
      type_breakdown: typeBreakdown
    });
    
  } catch (error) {
    console.error('Error fetching meeting stats:', error);
    res.status(500).json({ error: 'Failed to fetch meeting statistics' });
  }
});

// Global error handler for this router
router.use((err, req, res, next) => {
  console.error('[meetings_router_error] Unhandled error:', err);
  console.error('[meetings_router_error] Stack:', err.stack);
  console.error('[meetings_router_error] Request body:', req.body);
  console.error('[meetings_router_error] Request user:', req.user);
  
  res.status(500).json({ 
    error: 'Internal server error in meetings router',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

module.exports = router;
