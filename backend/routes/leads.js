const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const Lead = require('../models/Lead');
const Client = require('../models/Client');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'), false);
    }
  }
});

// Auth guard - ensure user is authenticated
router.use((req, res, next) => {
  console.log('[leads_auth] Auth guard running...');
  console.log('[leads_auth] req.user:', req.user);
  
  const uid = req.user && (req.user.id || req.user._id);
  if (!uid) {
    console.error('[leads_auth] req.user missing after auth middleware:', req.user);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  console.log('[leads_auth] User ID found:', uid);
  // Normalize the user ID for downstream use
  req.user.id = uid;
  req.user._id = uid;
  next();
});

// Validation middleware
const validateLead = [
  body('fullName').trim().isLength({ min: 1, max: 100 }).withMessage('Full name is required and must be less than 100 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('phone').optional({ checkFalsy: true }).matches(/^[\+]?[\d\s\-\(\)]{7,20}$/).withMessage('Please enter a valid phone number (7-20 characters)'),
  body('company').optional().trim().isLength({ max: 200 }).withMessage('Company name must be less than 200 characters'),
  body('source').optional().isIn(['website', 'referral', 'facebook', 'linkedin', 'whatsapp', 'marketing', 'cold_call', 'trade_show', 'other']).withMessage('Invalid source'),
  body('status').optional().isIn(['new', 'contacted', 'in_progress', 'qualified', 'proposal', 'converted', 'dropped']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
  body('notes').optional().trim().isLength({ max: 2000 }).withMessage('Notes must be less than 2000 characters'),
  body('estimated_value').optional().isNumeric().withMessage('Estimated value must be a number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters')
];

// Get all leads for the authenticated user
router.get('/', async (req, res) => {
  try {
    const { search, status, source, priority, page = 1, limit = 50 } = req.query;
    
    // Build filter object
    const filter = { ownerId: req.user.id };
    
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (source && source !== 'all') {
      filter.source = source;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get leads with pagination
    const leads = await Lead.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Lead.countDocuments(filter);
    
    res.json({
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[leads_get] Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Get lead statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      { $match: { ownerId: req.user.id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
          proposal: { $sum: { $cond: [{ $eq: ['$status', 'proposal'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
          dropped: { $sum: { $cond: [{ $eq: ['$status', 'dropped'] }, 1, 0] } }
        }
      }
    ]);
    
    const sourceStats = await Lead.aggregate([
      { $match: { ownerId: req.user.id } },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    const monthlyStats = await Lead.aggregate([
      { $match: { ownerId: req.user.id } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]);
    
    res.json({
      status: stats[0] || {
        total: 0, new: 0, contacted: 0, inProgress: 0,
        qualified: 0, proposal: 0, converted: 0, dropped: 0
      },
      sources: sourceStats,
      monthly: monthlyStats
    });
  } catch (error) {
    console.error('[leads_stats] Error fetching lead statistics:', error);
    res.status(500).json({ error: 'Failed to fetch lead statistics' });
  }
});

// Get a single lead by ID
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, ownerId: req.user.id });
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json({ lead });
  } catch (error) {
    console.error('[leads_get_by_id] Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// Create a new lead
router.post('/', validateLead, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const leadData = {
      ...req.body,
      ownerId: req.user.id
    };
    
    // Check for duplicate email if provided
    if (leadData.email) {
      const existingLead = await Lead.findOne({ 
        email: leadData.email, 
        ownerId: req.user.id 
      });
      
      if (existingLead) {
        return res.status(400).json({ 
          error: 'A lead with this email already exists' 
        });
      }
    }
    
    // Check for duplicate phone if provided
    if (leadData.phone) {
      const existingLead = await Lead.findOne({ 
        phone: leadData.phone, 
        ownerId: req.user.id 
      });
      
      if (existingLead) {
        return res.status(400).json({ 
          error: 'A lead with this phone number already exists' 
        });
      }
    }
    
    const lead = new Lead(leadData);
    await lead.save();
    
    res.status(201).json({ 
      message: 'Lead created successfully', 
      lead 
    });
  } catch (error) {
    console.error('[leads_create] Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// Update a lead
router.put('/:id', validateLead, async (req, res) => {
  try {
    console.log(`[leads_update] !!!! LEAD UPDATE ROUTE HIT !!!! ID: ${req.params.id}`);
    console.log(`[leads_update] Starting update for lead ID: ${req.params.id}`);
    console.log(`[leads_update] Request body:`, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const lead = await Lead.findOne({ _id: req.params.id, ownerId: req.user.id });
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    console.log(`[leads_update] Found lead:`, {
      id: lead._id,
      name: lead.fullName,
      currentStatus: lead.status,
      newStatus: req.body.status
    });
    
    // Check for duplicate email if changing
    if (req.body.email && req.body.email !== lead.email) {
      const existingLead = await Lead.findOne({ 
        email: req.body.email, 
        ownerId: req.user.id,
        _id: { $ne: req.params.id }
      });
      
      if (existingLead) {
        return res.status(400).json({ 
          error: 'A lead with this email already exists' 
        });
      }
    }
    
    // Check for duplicate phone if changing
    if (req.body.phone && req.body.phone !== lead.phone) {
      const existingLead = await Lead.findOne({ 
        phone: req.body.phone, 
        ownerId: req.user.id,
        _id: { $ne: req.params.id }
      });
      
      if (existingLead) {
        return res.status(400).json({ 
          error: 'A lead with this phone number already exists' 
        });
      }
    }
    
    // If status is being changed to 'converted', create a client
    console.log(`[leads_update] Checking conversion: req.body.status=${req.body.status}, lead.status=${lead.status}`);
    if (req.body.status === 'converted' && lead.status !== 'converted') {
      console.log(`[leads_update] Converting lead ${lead.fullName} to client...`);
      
      // Ensure required fields are present
      if (!lead.phone) {
        console.error('[leads_update] Cannot convert lead to client: phone number is required');
        return res.status(400).json({ 
          error: 'Cannot convert lead to client: phone number is required' 
        });
      }

      try {
        // Direct mapping with explicit values
        let clientSource = 'Other';
        let clientPriority = 'Medium';
        
        // Map source values
        switch(lead.source) {
          case 'website': clientSource = 'Website'; break;
          case 'referral': clientSource = 'Referral'; break;
          case 'facebook': 
          case 'linkedin': 
          case 'whatsapp': clientSource = 'Social Media'; break;
          case 'cold_call': clientSource = 'Cold Call'; break;
          case 'trade_show': clientSource = 'Trade Show'; break;
          default: clientSource = 'Other';
        }
        
        // Map priority values
        switch(lead.priority) {
          case 'low': clientPriority = 'Low'; break;
          case 'medium': clientPriority = 'Medium'; break;
          case 'high': clientPriority = 'High'; break;
          default: clientPriority = 'Medium';
        }
        
        console.log(`[leads_update] Mapping: ${lead.source} -> ${clientSource}, ${lead.priority} -> ${clientPriority}`);
        
        // Create client with mapped values
        const client = new Client({
          name: lead.fullName,
          email: lead.email || '',
          phone: lead.phone,
          business_name: lead.company || 'Converted Lead',
          business_description: lead.notes || 'Converted from lead',
          address: '',
          pitch_status: 'Pending',
          user: req.user.id,
          source: clientSource,
          priority: clientPriority,
          estimated_value: lead.estimated_value || undefined,
          currency: lead.currency || 'USD',
          notes: `Converted from lead: ${lead.fullName}`
        });
        
        await client.save();
        req.body.clientId = client._id;
        
        console.log(`[leads_update] Successfully converted lead to client with ID: ${client._id}`);
      } catch (clientError) {
        console.error('[leads_update] Error creating client:', clientError);
        return res.status(400).json({ 
          error: 'Failed to convert lead to client: ' + clientError.message 
        });
      }
    }
    
    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    // Check if lead was converted to client
    const wasConverted = req.body.status === 'converted' && lead.status !== 'converted';
    
    res.json({ 
      message: wasConverted ? 'Lead converted to client successfully!' : 'Lead updated successfully', 
      lead: updatedLead,
      convertedToClient: wasConverted
    });
  } catch (error) {
    console.error('[leads_update] Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// Delete a lead
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, ownerId: req.user.id });
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    await Lead.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('[leads_delete] Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// Bulk import leads from CSV/Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    let workbook;
    let sheetName;
    
    try {
      if (req.file.mimetype === 'text/csv') {
        // Handle CSV
        const csvData = req.file.buffer.toString();
        workbook = XLSX.read(csvData, { type: 'string' });
        sheetName = workbook.SheetNames[0];
      } else {
        // Handle Excel
        workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        sheetName = workbook.SheetNames[0];
      }
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a valid CSV or Excel file.' });
    }
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length < 2) {
      return res.status(400).json({ error: 'File must contain at least a header row and one data row.' });
    }
    
    const headers = jsonData[0].map(h => h?.toString().toLowerCase().trim());
    const dataRows = jsonData.slice(1);
    
    // Validate required headers
    const requiredHeaders = ['fullname', 'email', 'phone'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return res.status(400).json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}` 
      });
    }
    
    const results = {
      total: dataRows.length,
      imported: 0,
      skipped: 0,
      errors: []
    };
    
    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2; // +2 because we start from row 2 (after header)
      
      try {
        // Map data to lead fields
        const leadData = {};
        
        headers.forEach((header, index) => {
          const value = row[index];
          if (value !== undefined && value !== null && value !== '') {
            switch (header) {
              case 'fullname':
                leadData.fullName = value.toString().trim();
                break;
              case 'email':
                leadData.email = value.toString().trim().toLowerCase();
                break;
              case 'phone':
                leadData.phone = value.toString().trim();
                break;
              case 'company':
                leadData.company = value.toString().trim();
                break;
              case 'source':
                leadData.source = value.toString().trim().toLowerCase();
                break;
              case 'status':
                leadData.status = value.toString().trim().toLowerCase();
                break;
              case 'priority':
                leadData.priority = value.toString().trim().toLowerCase();
                break;
              case 'notes':
                leadData.notes = value.toString().trim();
                break;
              case 'estimated_value':
                leadData.estimated_value = parseFloat(value);
                break;
              case 'currency':
                leadData.currency = value.toString().trim().toUpperCase();
                break;
            }
          }
        });
        
        // Validate required fields
        if (!leadData.fullName) {
          results.errors.push({
            row: rowNumber,
            error: 'Full name is required'
          });
          results.skipped++;
          continue;
        }
        
        // Check for duplicates
        const duplicateQuery = { ownerId: req.user.id };
        if (leadData.email) {
          duplicateQuery.email = leadData.email;
        }
        if (leadData.phone) {
          duplicateQuery.phone = leadData.phone;
        }
        
        const existingLead = await Lead.findOne(duplicateQuery);
        if (existingLead) {
          results.errors.push({
            row: rowNumber,
            error: 'Duplicate lead (email or phone already exists)'
          });
          results.skipped++;
          continue;
        }
        
        // Set default values
        leadData.ownerId = req.user.id;
        if (!leadData.status) leadData.status = 'new';
        if (!leadData.priority) leadData.priority = 'medium';
        if (!leadData.source) leadData.source = 'website';
        
        // Create lead
        const lead = new Lead(leadData);
        await lead.save();
        results.imported++;
        
      } catch (rowError) {
        results.errors.push({
          row: rowNumber,
          error: rowError.message || 'Unknown error'
        });
        results.skipped++;
      }
    }
    
    res.json({
      message: 'Import completed',
      results
    });
    
  } catch (error) {
    console.error('[leads_import] Error importing leads:', error);
    res.status(500).json({ error: 'Failed to import leads' });
  }
});

// Export leads to Excel
router.get('/export/excel', async (req, res) => {
  try {
    const { status, source, priority, startDate, endDate } = req.query;
    
    // Build filter object
    const filter = { ownerId: req.user.id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (source && source !== 'all') {
      filter.source = source;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    
    // Prepare data for export
    const exportData = leads.map(lead => ({
      'Full Name': lead.fullName || '',
      'Email': lead.email || '',
      'Phone': lead.phone || '',
      'Company': lead.company || '',
      'Source': lead.source || '',
      'Status': lead.status || '',
      'Priority': lead.priority || '',
      'Notes': lead.notes || '',
      'Estimated Value': lead.estimated_value || '',
      'Currency': lead.currency || '',
      'Created Date': lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '',
      'Last Updated': lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : ''
    }));
    
    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    // Send file
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
    
  } catch (error) {
    console.error('[leads_export] Error exporting leads:', error);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

// Bulk update lead statuses
router.patch('/bulk-update', async (req, res) => {
  try {
    const { leadIds, updates } = req.body;
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'Lead IDs array is required' });
    }
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }
    
    // Validate that all leads belong to the user
    const leads = await Lead.find({ 
      _id: { $in: leadIds }, 
      ownerId: req.user.id 
    });
    
    if (leads.length !== leadIds.length) {
      return res.status(400).json({ error: 'Some leads not found or access denied' });
    }
    
    // Update leads
    const result = await Lead.updateMany(
      { _id: { $in: leadIds }, ownerId: req.user.id },
      { $set: updates }
    );
    
    res.json({ 
      message: 'Leads updated successfully', 
      updatedCount: result.modifiedCount 
    });
    
  } catch (error) {
    console.error('[leads_bulk_update] Error bulk updating leads:', error);
    res.status(500).json({ error: 'Failed to update leads' });
  }
});

// Bulk delete leads
router.delete('/bulk-delete', async (req, res) => {
  try {
    const { leadIds } = req.body;
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'Lead IDs array is required' });
    }
    
    // Validate that all leads belong to the user
    const leads = await Lead.find({ 
      _id: { $in: leadIds }, 
      ownerId: req.user.id 
    });
    
    if (leads.length !== leadIds.length) {
      return res.status(400).json({ error: 'Some leads not found or access denied' });
    }
    
    // Delete leads
    const result = await Lead.deleteMany({ 
      _id: { $in: leadIds }, 
      ownerId: req.user.id 
    });
    
    res.json({ 
      message: 'Leads deleted successfully', 
      deletedCount: result.deletedCount 
    });
    
  } catch (error) {
    console.error('[leads_bulk_delete] Error bulk deleting leads:', error);
    res.status(500).json({ error: 'Failed to delete leads' });
  }
});

// Bulk reorder leads
router.patch('/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    const bulkOps = items.map(item => ({
      updateOne: {
        filter: { _id: item._id, ownerId: req.user.id },
        update: { $set: { status: item.status, order: item.order } }
      }
    }));
    
    if (bulkOps.length > 0) {
      await Lead.bulkWrite(bulkOps);
    }
    
    res.json({ message: 'Leads reordered successfully' });
  } catch (error) {
    console.error('[leads_reorder] Error reordering leads:', error);
    res.status(500).json({ error: 'Failed to reorder leads' });
  }
});

module.exports = router;
