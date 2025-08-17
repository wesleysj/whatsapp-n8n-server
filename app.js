const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const axios = require('axios');
const mime = require('mime-types');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const API_TOKEN = process.env.API_TOKEN;
let webhookUrl = process.env.WEBHOOK_URL || null;
const port = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const Util = require('./util/Util');
const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);
app.use(cors());
app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use("/", express.static(__dirname + "/"))
const validateToken = (req, res, next) => {
  if (!API_TOKEN) return next();
  const auth = req.headers["authorization"];
  const token = auth && auth.startsWith("Bearer ") ? auth.substring(7) : req.query.api_key;
  if (token !== API_TOKEN) {
    return res.status(401).json({ status: false, message: "Invalid API token" });
  }
  next();
};

app.use(validateToken);

app.post('/webhook', [
  body('url')
    .trim()
    .notEmpty()
    .isURL()
    .withMessage('Invalid URL'),
], (req, res) => {
  const errors = validationResult(req).formatWith(({ msg }) => msg);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped(),
    });
  }

  try {
    new URL(req.body.url);
  } catch (err) {
    return res.status(422).json({
      status: false,
      message: { url: 'Invalid URL' },
    });
  }

  webhookUrl = req.body.url;

  res.status(200).json({
    status: true,
    message: 'Webhook URL updated',
    webhookUrl,
  });
});


const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'client-one' }),
  puppeteer: {
    headless: 'chrome',
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run'
    ]
  }
});
client.initialize();

client.on('message', async (msg) => {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, {
      id: msg.id._serialized,
      from: msg.from,
      to: msg.to,
      body: msg.body,
    });
  } catch (err) {
    console.error('Error sending webhook:', err.message);
  }
});

io.on('connection', function(socket) {
  socket.emit('message', 'Server running...');

  client.on('qr', (qr) => {
      console.log('QR RECEIVED', qr);
      qrcode.toDataURL(qr, (err, url) => {
        socket.emit('qr', url);
        socket.emit('message', 'QRCode received, point the camera on your cell phone!');
      });
  });

  client.on('ready', () => {
      socket.emit('ready', 'Device is ready!');
      socket.emit('message', 'Device is ready!');
      socket.emit('qr', './check.svg')	
      console.log('Device is ready!');
  });

  client.on('authenticated', () => {
      socket.emit('authenticated', 'Server Authenticated!');
      socket.emit('message', 'Server Authenticated!');
      console.log('Server Authenticated!');
  });

  client.on('auth_failure', function() {
      socket.emit('message', 'Authentication failed, restarting...');
      console.error('Authentication failed.');
  });

  client.on('change_state', state => {
    console.log('Connection status: ', state );
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Client disconnected!');
    console.log('Client disconnected!', reason);
    client.initialize();
  });
});

// Send message
app.post('/send-message', [
  body('number')
    .trim()
    .notEmpty()
    .matches(/^\d+$/)
    .withMessage('Number should contain digits only')
    .escape(),
  body('message')
    .trim()
    .notEmpty()
    .escape(),
  ], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = Util.formatPhoneNumber(req.body.number);
  const message = req.body.message;
  
  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      message: 'Message sent successfully.',
      response: response
    });
  }).catch(err => {
      res.status(500).json({
        status: false,
        message: 'Message not sent.',
        response: err.text
      });
    });  
});

// Get chats
app.get('/chats', (req, res) => {
  client.getChats().then(response => {
    res.status(200).json({
      status: true,
      message: 'Returning chats',
      response: response
    });
  }).catch(err => {
      res.status(500).json({
        status: false,
        message: 'Cant return chats.',
        response: err.text
      });
    });  
});

// Get group participants
app.get('/group-participants', [
  query('groupId')
    .trim()
    .notEmpty()
    .escape(),
  ], (req, res) => {
  const errors = validationResult(req).formatWith(({ msg }) => msg);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let groupId = req.query.groupId;
  
  client.getChatById(groupId).then(response => {
    res.status(200).json({
        status: true,
        message: 'Returning chats',
        response: response.groupMetadata.participants
      });
  }).catch(err => {
      res.status(500).json({
        status: false,
        message: 'Cant return chats.',
        response: err.text
      });
    });      
});


server.listen(port, function() {  console.log('App running on *: ' + port);});
