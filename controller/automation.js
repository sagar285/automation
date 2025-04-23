// controllers/automation.controller.js
const { pool } = require('../dbmanager');
const { v4: uuidv4 } = require('uuid');

// Get all automations for accounts that the user has access to
const getAutomations = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(userId,"userid");

    // Get all automations for accounts where user is an admin
    const query = `
      SELECT a.* 
      FROM automations a
      JOIN account_admins aa ON a.account_id = aa.account_id
      WHERE aa.user_id = $1
      ORDER BY a.updated_at DESC
    `;
    
    const result = await pool.query(query, [userId]);
    
    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching automations:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Get a single automation by ID
const getAutomationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Get automation only if user has access to the account
    const query = `
      SELECT a.* 
      FROM automations a
      JOIN account_admins aa ON a.account_id = aa.account_id
      WHERE a.id = $1 AND aa.user_id = $2
    `;
    
    const result = await pool.query(query, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Automation not found or you do not have access'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching automation:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Create a new automation
const createAutomation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      accountId,
      name,
      postSelection,
      trigger,
      dmType,
      messageTemplate,
      autoReply,
      askToFollow,
      removeBranding,
      backtrack
    } = req.body;
    
    // Validate that the user has access to this account
    const accessCheck = await pool.query(
      'SELECT id FROM account_admins WHERE user_id = $1 AND account_id = $2',
      [userId, accountId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this account'
      });
    }
    
    // Prepare database fields from form data
    const isUniversal = postSelection.type === 'all';
    const mediaId = !isUniversal && postSelection.postIds.length > 0 ? postSelection.postIds.join(',') : null;
    const triggerType = trigger.type.toUpperCase();
    const keywordTriggerType = trigger.type === 'specific' ? 'CONTAINS' : null;
    
    // Message template handling
    let dmMessage = null;
    let genericTemplate = null;
    let additionButtons = null;
    
    if (dmType === 'message' && messageTemplate.type === 'message') {
      dmMessage = messageTemplate.message;
      if (messageTemplate.buttons && messageTemplate.buttons.length > 0) {
        additionButtons = messageTemplate.buttons;
      }
    } else {
      // For more complex templates
      genericTemplate = messageTemplate;
    }
    
    // Create automation
    const insertQuery = `
      INSERT INTO automations (
        id,
        account_id,
        name,
        type,
        is_universal,
        media_id,
        trigger_type,
        keyword_trigger_type,
        keywords,
        dm_message,
        generic_template,
        addition_buttons,
        auto_public_reply,
        auto_reply_mode,
        auto_reply_messages,
        auto_reply_limit,
        ask_to_follow,
        ask_follow_text,
        ask_follow_button,
        disable_url_tracking,
        use_rewind,
        is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      RETURNING *
    `;
    
    const automationId = uuidv4();
    const values = [
      automationId,
      accountId,
      name,
      dmType,
      isUniversal,
      mediaId,
      triggerType,
      keywordTriggerType,
      trigger.keywords,
      dmMessage,
      genericTemplate ? JSON.stringify(genericTemplate) : null,
      additionButtons ? JSON.stringify(additionButtons) : null,
      autoReply.enabled,
      autoReply.replyType.toUpperCase(),
      autoReply.replies,
      autoReply.replyCount,
      askToFollow.enabled,
      askToFollow.message,
      askToFollow.buttonText,
      removeBranding,
      backtrack,
      true // is_active
    ];
    
    const result = await pool.query(insertQuery, values);
    
    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Automation created successfully'
    });
  } catch (error) {
    console.error('Error creating automation:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Update an existing automation
const updateAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const {
      name,
      postSelection,
      trigger,
      dmType,
      messageTemplate,
      autoReply,
      askToFollow,
      removeBranding,
      backtrack
    } = req.body;
    
    // Check if automation exists and user has access
    const accessCheck = await pool.query(`
      SELECT a.* 
      FROM automations a
      JOIN account_admins aa ON a.account_id = aa.account_id
      WHERE a.id = $1 AND aa.user_id = $2
    `, [id, userId]);
    
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Automation not found or you do not have access'
      });
    }
    
    // Prepare update data
    const isUniversal = postSelection.type === 'all';
    const mediaId = !isUniversal && postSelection.postIds.length > 0 ? postSelection.postIds[0] : null;
    const triggerType = trigger.type.toUpperCase();
    const keywordTriggerType = trigger.type === 'specific' ? 'CONTAINS' : null;
    
    // Message template handling
    let dmMessage = null;
    let genericTemplate = null;
    let additionButtons = null;
    
    if (dmType === 'message' && messageTemplate.type === 'message') {
      dmMessage = messageTemplate.message;
      if (messageTemplate.buttons && messageTemplate.buttons.length > 0) {
        additionButtons = messageTemplate.buttons;
      }
    } else {
      // For more complex templates
      genericTemplate = messageTemplate;
    }
    
    // Update automation
    const updateQuery = `
      UPDATE automations SET
        name = $1,
        is_universal = $2,
        media_id = $3,
        trigger_type = $4,
        keyword_trigger_type = $5,
        keywords = $6,
        dm_message = $7,
        generic_template = $8,
        addition_buttons = $9,
        auto_public_reply = $10,
        auto_reply_mode = $11,
        auto_reply_messages = $12,
        auto_reply_limit = $13,
        ask_to_follow = $14,
        ask_follow_text = $15,
        ask_follow_button = $16,
        disable_url_tracking = $17,
        use_rewind = $18,
        updated_at = NOW()
      WHERE id = $19
      RETURNING *
    `;
    
    const values = [
      name,
      isUniversal,
      mediaId,
      triggerType,
      keywordTriggerType,
      trigger.keywords,
      dmMessage,
      genericTemplate ? JSON.stringify(genericTemplate) : null,
      additionButtons ? JSON.stringify(additionButtons) : null,
      autoReply.enabled,
      autoReply.replyType.toUpperCase(),
      autoReply.replies,
      autoReply.replyCount,
      askToFollow.enabled,
      askToFollow.message,
      askToFollow.buttonText,
      removeBranding,
      backtrack,
      id
    ];
    
    const result = await pool.query(updateQuery, values);
    
    return res.status(200).json({
      success: true,
      data: result.rows[0],
      message: 'Automation updated successfully'
    });
  } catch (error) {
    console.error('Error updating automation:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Delete an automation
const deleteAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Check if automation exists and user has access
    const accessCheck = await pool.query(`
      SELECT a.id 
      FROM automations a
      JOIN account_admins aa ON a.account_id = aa.account_id
      WHERE a.id = $1 AND aa.user_id = $2
    `, [id, userId]);
    
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Automation not found or you do not have access'
      });
    }
    
    // Delete automation
    await pool.query('DELETE FROM automations WHERE id = $1', [id]);
    
    return res.status(200).json({
      success: true,
      message: 'Automation deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting automation:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Toggle automation active status
const toggleAutomationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Check if automation exists and user has access
    const accessCheck = await pool.query(`
      SELECT a.id, a.is_active
      FROM automations a
      JOIN account_admins aa ON a.account_id = aa.account_id
      WHERE a.id = $1 AND aa.user_id = $2
    `, [id, userId]);
    
    if (accessCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Automation not found or you do not have access'
      });
    }
    
    // Toggle is_active status
    const currentStatus = accessCheck.rows[0].is_active;
    const newStatus = !currentStatus;
    
    const result = await pool.query(
      'UPDATE automations SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newStatus, id]
    );
    
    return res.status(200).json({
      success: true,
      data: result.rows[0],
      message: `Automation ${newStatus ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling automation status:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

module.exports = {
  getAutomations,
  getAutomationById,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomationStatus
};