// utils/db-manager.js
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Configure PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'instauser',
  host: process.env.DB_HOST || '213.199.51.192',
  database: process.env.DB_NAME || 'instaautomation',
  password: process.env.DB_PASSWORD || 'Postgres@123',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL database connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
  });

/**
 * Creates a table with dynamic columns if it doesn't exist
 * @param {string} tableName - Name of the table to create
 * @param {Array<{name: string, type: string, constraints: string|string[]}>} columns - Array of column definitions
 * @returns {Promise<Object>} - Query result
 */
async function createTableIfNotExists(tableName, columns) {
  try {
    // Validate input
    if (!tableName || !columns || !Array.isArray(columns) || columns.length === 0) {
      throw new Error('Invalid table name or columns');
    }

    // Build column definitions
    const columnDefinitions = columns.map(col => {
      // Handle constraints as array or string
      let constraintStr = '';
      if (col.constraints) {
        if (Array.isArray(col.constraints)) {
          constraintStr = ' ' + col.constraints.join(' ');
        } else if (typeof col.constraints === 'string' && col.constraints.trim() !== '') {
          constraintStr = ' ' + col.constraints;
        }
      }
      return `${col.name} ${col.type}${constraintStr}`;
    }).join(', ');

    // Create SQL query
    const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefinitions})`;
    
    // Execute query
    const result = await pool.query(query);
    console.log(`Table ${tableName} created or already exists`);
    return { success: true, message: `Table ${tableName} created or already exists`, result };
  } catch (error) {
    console.error('Error creating table:', error);
    return { success: false, message: error.message };
  }
}




/**
 * Deletes a table if it exists
 * @param {string} tableName - Name of the table to delete
 * @returns {Promise<Object>} - Query result
 */
async function deleteTable(tableName) {
  try {
    // Validate input
    if (!tableName) {
      throw new Error('Table name is required');
    }

    // Check if table exists before attempting to delete
    const exists = await tableExists(tableName);
    
    if (!exists) {
      return { success: false, message: `Table ${tableName} does not exist` };
    }

    // Create SQL query with CASCADE to handle dependencies
    const query = `DROP TABLE ${tableName} CASCADE`;
    
    // Execute query
    const result = await pool.query(query);
    console.log(`Table ${tableName} deleted successfully`);
    return { success: true, message: `Table ${tableName} deleted successfully`, result };
  } catch (error) {
    console.error('Error deleting table:', error);
    return { success: false, message: error.message };
  }
}





/**
 * Adds a column to an existing table
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to add
 * @param {string} dataType - Data type of the column
 * @param {string|string[]} constraints - Optional constraints for the column
 * @returns {Promise<Object>} - Query result
 */
async function addColumn(tableName, columnName, dataType, constraints = '') {
  try {
    // Validate input
    if (!tableName || !columnName || !dataType) {
      throw new Error('Table name, column name, and data type are required');
    }

    // Handle constraints as array or string
    let constraintStr = '';
    if (constraints) {
      if (Array.isArray(constraints)) {
        constraintStr = ' ' + constraints.join(' ');
      } else if (typeof constraints === 'string' && constraints.trim() !== '') {
        constraintStr = ' ' + constraints;
      }
    }

    // Check if column already exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `;
    const checkResult = await pool.query(checkQuery, [tableName, columnName]);
    
    if (checkResult.rows.length > 0) {
      return { success: false, message: `Column ${columnName} already exists in table ${tableName}` };
    }

    // Create SQL query
    const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${dataType}${constraintStr}`;
    
    // Execute query
    const result = await pool.query(query);
    console.log(`Column ${columnName} added to table ${tableName}`);
    return { success: true, message: `Column ${columnName} added to table ${tableName}`, result };
  } catch (error) {
    console.error('Error adding column:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Deletes a column from an existing table
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to delete
 * @returns {Promise<Object>} - Query result
 */
async function deleteColumn(tableName, columnName) {
  try {
    // Validate input
    if (!tableName || !columnName) {
      throw new Error('Table name and column name are required');
    }

    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `;
    const checkResult = await pool.query(checkQuery, [tableName, columnName]);
    
    if (checkResult.rows.length === 0) {
      return { success: false, message: `Column ${columnName} does not exist in table ${tableName}` };
    }

    // Create SQL query
    const query = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
    
    // Execute query
    const result = await pool.query(query);
    console.log(`Column ${columnName} deleted from table ${tableName}`);
    return { success: true, message: `Column ${columnName} deleted from table ${tableName}`, result };
  } catch (error) {
    console.error('Error deleting column:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Modifies a column in an existing table
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to modify
 * @param {string} newDataType - New data type for the column (optional)
 * @param {string} newColumnName - New name for the column (optional)
 * @param {string|string[]} constraints - Constraints to add or remove (optional)
 * @returns {Promise<Object>} - Query result
 */
async function modifyColumn(tableName, columnName, newDataType = null, newColumnName = null, constraints = null) {
  try {
    // Validate input
    if (!tableName || !columnName) {
      throw new Error('Table name and column name are required');
    }

    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `;
    const checkResult = await pool.query(checkQuery, [tableName, columnName]);
    
    if (checkResult.rows.length === 0) {
      return { success: false, message: `Column ${columnName} does not exist in table ${tableName}` };
    }

    let result;
    let messages = [];
    
    // If new column name is provided, rename the column
    if (newColumnName && newColumnName !== columnName) {
      const renameQuery = `ALTER TABLE ${tableName} RENAME COLUMN ${columnName} TO ${newColumnName}`;
      result = await pool.query(renameQuery);
      console.log(`Column ${columnName} renamed to ${newColumnName} in table ${tableName}`);
      messages.push(`Column ${columnName} renamed to ${newColumnName}`);
      
      // Update column name for subsequent operations
      columnName = newColumnName;
    }
    
    // If new data type is provided, change the data type
    if (newDataType) {
      const typeQuery = `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${newDataType} USING ${columnName}::${newDataType}`;
      result = await pool.query(typeQuery);
      console.log(`Data type of column ${columnName} changed to ${newDataType} in table ${tableName}`);
      messages.push(`Data type changed to ${newDataType}`);
    }
    
    // If constraints are provided, apply them
    if (constraints) {
      let constraintQuery = '';
      
      // Handle different constraint operations
      if (typeof constraints === 'string') {
        if (constraints.includes('DROP')) {
          // For operations like 'DROP NOT NULL'
          constraintQuery = `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} ${constraints}`;
        } else {
          // For operations like 'SET NOT NULL'
          constraintQuery = `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} ${constraints}`;
        }
      } else if (Array.isArray(constraints)) {
        // Execute each constraint operation in sequence
        for (const constraint of constraints) {
          const singleConstraintQuery = `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} ${constraint}`;
          await pool.query(singleConstraintQuery);
          console.log(`Applied constraint "${constraint}" to column ${columnName} in table ${tableName}`);
          messages.push(`Applied constraint: ${constraint}`);
        }
        // Skip the execution below since we already applied constraints
        constraintQuery = '';
      }
      
      if (constraintQuery) {
        result = await pool.query(constraintQuery);
        console.log(`Constraints of column ${columnName} modified in table ${tableName}`);
        messages.push(`Constraints modified`);
      }
    }
    
    return { 
      success: true, 
      message: `Column ${columnName} modified in table ${tableName}: ${messages.join(', ')}`, 
      result 
    };
  } catch (error) {
    console.error('Error modifying column:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Checks if a table exists
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} - Whether the table exists
 */
async function tableExists(tableName) {
  try {
    const query = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      );
    `;
    const result = await pool.query(query, [tableName]);
    return result.rows[0].exists;
  } catch (error) {
    console.error('Error checking if table exists:', error);
    return false;
  }
}

/**
 * Gets all columns for a table
 * @param {string} tableName - Name of the table
 * @returns {Promise<Array>} - Array of column information
 */
async function getTableColumns(tableName) {
  try {
    const query = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `;
    const result = await pool.query(query, [tableName]);
    return { success: true, columns: result.rows };
  } catch (error) {
    console.error('Error getting table columns:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  pool,
  createTableIfNotExists,
  addColumn,
  deleteColumn,
  modifyColumn,
  tableExists,
  getTableColumns,
  deleteTable
};