const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const dbpool = require("./dbmanager");
const router = require("./router/route");
const automationroute = require("./router/automation-route");
const cors =require("cors")
const dotenv = require("dotenv")
const cookieParser = require('cookie-parser');

dotenv.config({})

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  // origin: 'https://fliqrai.vercel.app', // Your frontend URL
  credentials: true 
}))
app.use(router);
app.use('/automations',automationroute);


// insta app id
// 2901287790027729

// insta app secret
// 27e047e52de1d98e09e2912002b9667a


// supabse password
// Postgres@123

//   const ff =async() =>{

  
//  await dbpool.deleteTable("instagram_accounts")
//  await dbpool.deleteTable("users")
//   await dbpool.deleteTable("email_verification")
//   await dbpool.deleteTable("user_sessions")
//   }

//   ff();



app.get("/ngrok",(req,res)=>{
  res.send("Ngrok is up and running")
})



app.get("/instagram",(req,res)=>{
    console.log(req.params,req.query,"console from ints")
})
app.get("/instagram",(req,res)=>{
    console.log(req.params,req.query,"console from ints")
})

app.listen(5000, () => console.log('Server is running'));