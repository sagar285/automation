const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const dbpool = require("./dbmanager");
const router = require("./router/route");
const automationroute = require("./router/automation-route");
const webhookrouter = require("./router/webhook");
const cors =require("cors")
const dotenv = require("dotenv")
const cookieParser = require('cookie-parser');

dotenv.config({})

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  // origin: 'http://localhost:3000', // Your frontend URL
  // origin: 'https://fliqrai.vercel.app', // Your frontend URL
  origin: 'https://engage.fliqr.ai/', // Your frontend URL
  credentials: true 
}))
app.use(webhookrouter);
app.use(router);
app.use('/automations',automationroute);

// async function setupDatabaseExtensions() {
//     console.log('Adding user_insta_business_id column to accounts table...');
//     const result = await dbpool.addColumn(
//         'accounts',                 // Table name
//         'user_insta_business_id',   // New column name
//         'TEXT',                     // Data type
//         'UNIQUE'                    // Constraint
//     );

//     if (result.success) {
//         console.log(result.message);
//     } else {
//         // It might fail if the column already exists, which is okay if expected
//         if (result.message.includes('already exists')) {
//              console.log('Column user_insta_business_id already exists.');
//         } else {
//              console.error('Failed to add column:', result.message);
//         }
//     }
//      // Close the pool if this is a standalone script
//      // await dbManager.pool.end();
// }

// setupDatabaseExtensions();



app.listen(5000, () => console.log('Server is running'));