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
const fs = require('fs');
const path = require('path');

const logger = require('./util/logger');
const Util = require('./util/Util');
const { prepareProfileDir } = require('./util/prepareProfileDir');

const API_TOKEN = process.env.API_TOKEN;
const SESSION_NAME = process.env.SESSION_NAME || 'client-one';
const DATA_PATH = process.env.DATA_PATH || '.wwebjs_auth';
const chromePath =
  process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
let webhookUrl = process.env.WEBHOOK_URL || null;
let ready = false;
const port = process.env.PORT || 8080;
const app = express();
app.set('trust proxy', 1);
app.set('isReady', true);
const server = http.createServer(app);
const io = socketIO(server);

const pidFile = path.join(DATA_PATH, `${SESSION_NAME}.pid`);

const originalProcessExit = process.exit.bind(process);
process.exit = (code = 0, reason) => {
  if (reason) {
    logger.info(`Process exiting with code ${code}: ${reason}`);
  } else {
    logger.info(`Process exiting with code ${code}`);
  }
  originalProcessExit(code);
};

function ensureSingleInstance() {
  try {
    fs.mkdirSync(DATA_PATH, { recursive: true });
    if (fs.existsSync(pidFile)) {
      const existingPid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      if (!isNaN(existingPid)) {
        try {
          process.kill(existingPid, 0);
          console.error(
            `Session already in use for data path ${DATA_PATH} by PID ${existingPid}`
          );
          process.exit(1, 'session in use');
        } catch (err) {
          fs.unlinkSync(pidFile);
        }
      }
    }
    fs.writeFileSync(pidFile, String(process.pid));
    const cleanup = () => {
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0, 'SIGINT');
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0, 'SIGTERM');
    });
  } catch (err) {
    console.error('Failed to ensure single instance:', err.message);
    process.exit(1, 'ensureSingleInstance failure');
  }
}

ensureSingleInstance();

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
app.use(express.static(path.join(__dirname, "public")))
const validateToken = (req, res, next) => {
  if (!API_TOKEN) {
    return res
      .status(401)
      .json({ status: false, message: "API token is required" });
  }

  const auth = req.headers["authorization"];
  const token =
    auth && auth.startsWith("Bearer ")
      ? auth.substring(7)
      : req.query.api_key;

  if (!token) {
    return res
      .status(401)
      .json({ status: false, message: "API token is required" });
  }

  if (token !== API_TOKEN) {
    return res
      .status(401)
      .json({ status: false, message: "Invalid API token" });
  }

  next();
};

app.use(validateToken);

app.get('/healthz', (req, res) => {
  if (ready) {
    return res.status(200).send('OK');
  }
  res.status(503).send('Service Unavailable');
});

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


prepareProfileDir(DATA_PATH);
const client = new Client({
  authStrategy: new LocalAuth({ clientId: SESSION_NAME, dataPath: DATA_PATH }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

async function initWithRetries({ tries, baseDelayMs }) {
  for (let i = 1; i <= tries; i++) {
    try {
      await client.initialize();
      return;
    } catch (err) {
      const transient =
        err?.name === 'TargetCloseError' ||
        ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(err?.code);
      if (!transient || i === tries) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (i - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

initWithRetries({ tries: 5, baseDelayMs: 1000 });

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
  if (ready) {
    socket.emit('ready', 'Device is ready!');
    socket.emit('message', 'Device is ready!');
    socket.emit('qr', './check.svg');
  }
});

client.on('qr', (qr) => {
  console.log('QR RECEIVED', qr);
  qrcode.toDataURL(qr, (err, url) => {
    io.emit('qr', url);
    io.emit('message', 'QRCode received, point the camera on your cell phone!');
  });
});

client.on('ready', () => {
  ready = true;
  io.emit('ready', 'Device is ready!');
  io.emit('message', 'Device is ready!');
  io.emit('qr', './check.svg');
  console.log('Device is ready!');
});

client.on('authenticated', () => {
  io.emit('authenticated', 'Server Authenticated!');
  io.emit('message', 'Server Authenticated!');
  console.log('Server Authenticated!');
});

client.on('auth_failure', function() {
  io.emit('message', 'Authentication failed, restarting...');
  console.error('Authentication failed.');
});

client.on('change_state', state => {
  console.log('Connection status: ', state );
});

client.on('disconnected', (reason) => {
  ready = false;
  io.emit('message', 'Client disconnected!');
  console.log('Client disconnected!', reason);
  initWithRetries({ tries: 5, baseDelayMs: 1000 })
    .catch(err => console.error('Reinitialize failed:', err));
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

async function gracefulShutdown(signal, err) {
  console.log(`Received ${signal}`);
  if (err) {
    console.error(err);
  }

  if (typeof app.set === 'function') {
    app.set('isReady', false);
  }

  try {
    await client.destroy();
  } catch (destroyErr) {
    console.error('Error destroying client:', destroyErr);
  }

  try {
    const browser = client.pupBrowser;
    if (browser) {
      await browser.close();
    }
  } catch (browserErr) {
    console.error('Error closing browser:', browserErr);
  }

  try {
    await new Promise((resolve) => server.close(resolve));
  } catch (serverErr) {
    console.error('Error closing server:', serverErr);
  }

  const code = signal === 'SIGINT' ? 0 : 1;
  process.exit(code, signal);
}

process.on('SIGINT', gracefulShutdown.bind(null, 'SIGINT'));
process.on('SIGTERM', gracefulShutdown.bind(null, 'SIGTERM'));
process.on('uncaughtException', gracefulShutdown.bind(null, 'uncaughtException'));
process.on('unhandledRejection', gracefulShutdown.bind(null, 'unhandledRejection'));
