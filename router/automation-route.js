// routes/automation.routes.js
const express = require('express');
const router = express.Router();
const automationController = require('../controller/automation');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware)

// Get all automations for a user's accounts
router.get('/',automationController.getAutomations);

// Get a single automation by ID
router.get('/:id', automationController.getAutomationById);

// Create a new automation
router.post('/', automationController.createAutomation);

// Update an existing automation
router.put('/:id', automationController.updateAutomation); 

// Delete an automation
router.delete('/:id', automationController.deleteAutomation);

// Toggle automation active status
router.patch('/:id/toggle', automationController.toggleAutomationStatus);

module.exports = router;