const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const dbpool = require("./dbmanager");
const router = require("./router/route");
const cors =require("cors")
const dotenv = require("dotenv")

dotenv.config({})

app.use(express.json());
app.use(cors({
  origin:"*"
}))
app.use(router);


// insta app id
// 2901287790027729

// insta app secret
// 27e047e52de1d98e09e2912002b9667a


// supabse password
// Postgres@123


// Verification endpoint
app.get('/webhook', (req, res) => {
    console.log(req.body,"pppp",req.query,req.params);
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // Your verification token (set this in Facebook Developer Console)
  const VERIFY_TOKEN = 'IGAApOtLQdo9FBZAE5hVWRrQTEzYUN6WFhNQmtseVVXdDRGS29iUFlxS1N2dGdMLU5XMDlqMk81MDl1S2dMT3M1NVljRXpJU3VxZAmdnRmxJLXFuYjVna0V4UzVfSWdPb3c1Y2ZAyTE9QdS1scVhxOUM2QUkwMVFGaE1ldTBQc1o2QQZDZD';
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    console.error('Verification failed');
    res.status(200).send({message:"get request succesfully available"});
  }
});

// Webhook event handler
app.post('/webhook', (req, res) => {
  console.log('Webhook event received:',req.body.entry[0].messaging);
  // Process the webhook event here
  res.sendStatus(200);
});

app.get("/ngrok",(req,res)=>{
  console.log(req.params,req.query,"console from ngrok")
  res.send("Ngrok is up and running")
})



app.get("/instagram",(req,res)=>{
    console.log(req.params,req.query,"console from ints")
})
app.get("/instagram",(req,res)=>{
    console.log(req.params,req.query,"console from ints")
})

app.listen(5000, () => console.log('Server is running'));