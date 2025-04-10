// server.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || '213.199.51.192',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'instaautomation',
  user: process.env.DB_USER || 'instauser',
  password: process.env.DB_PASSWORD || 'Postgres@123'
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully. Server time:', res.rows[0].now);
  }
});

// Simple test route
app.get('/', (req, res) => {
  res.json({ message: 'Instagram Automation API is running' });
});

// Test route to get users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, full_name, created_at FROM users');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});