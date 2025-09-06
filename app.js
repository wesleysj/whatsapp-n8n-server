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

const SESSION_NAME = process.env.SESSION_NAME || 'client-one';
// Resolve data directory to avoid writing under an unexpected working directory
const DATA_PATH = process.env.DATA_PATH
  ? path.resolve(process.env.DATA_PATH)
  : path.resolve(__dirname, '.wwebjs_auth');
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
const sessionPath = path.join(DATA_PATH, `session-${SESSION_NAME}`);
prepareProfileDir(sessionPath);

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
app.use(express.static(path.join(__dirname, "public")));
app.get('/healthz', (req, res) => {
  if (ready) {
    return res.status(200).send('OK');
  }
  res.status(503).send('Service Unavailable');
});
const validateToken = (req, res, next) => {
  // rotas públicas
  if (req.path === '/healthz' || (req.path && req.path.startsWith('/socket.io/'))) {
    return next();
  }

  const EXPECTED_RAW = process.env.API_TOKEN || process.env.API_TOKEN_WA;
  const EXPECTED = (EXPECTED_RAW || '').trim();

  if (!EXPECTED) {
    return res.status(500).json({ status: false, message: 'Server misconfigured: API token missing' });
  }

  const auth = req.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = (m && m[1]) ? m[1].trim() : (req.get('x-api-key') || req.query.api_key || '').trim();

  if (!token) {
    return res.status(401).json({ status: false, message: 'API token is required' });
  }

  if (token !== EXPECTED) {
    // debug opcional sem vazar segredo
    if (process.env.DEBUG_AUTH === '1') {
      console.warn('[AUTH] mismatch: recvLen=%d expLen=%d', token.length, EXPECTED.length);
    }
    return res.status(401).json({ status: false, message: 'Invalid API token' });
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
  authStrategy: new LocalAuth({ clientId: SESSION_NAME, dataPath: DATA_PATH }),
  takeoverOnConflict: true,
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    protocolTimeout: 180000, // 180s
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
  // padronizar user-agent ajuda algumas vezes
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
});

// --- DEBUG: listeners únicos + logs claros ---
if (!client.__listenersSet) {
  try {
    // Evita warning durante a depuração (ajuste depois se quiser)
    client.setMaxListeners(20);

    // Se você já tinha lógica dentro destes handlers, mova-a para cá
    client.on('message', async (msg) => {
      try {
        console.log('[WA] event=message from=', msg.from, 'body=', (msg.body || '').slice(0, 120));
        // ... sua lógica atual do handler "message" (se houver) ...
      } catch (e) {
        console.error('[WA] handler(message) error:', e);
      }
    });

    // QR no terminal para facilitar pareamento
    try {
      const qrcode = require('qrcode-terminal');
      client.on('qr', (qr) => {
        console.log('[WA] event=qr (aguardando scan)');
        try { qrcode.generate(qr, { small: true }); } catch (e) { console.error('[WA] qr render error:', e); }
      });
    } catch (e) {
      // Caso o pacote não esteja instalado, não quebra o app
      console.warn('[WA] qrcode-terminal não instalado; execute "npm i qrcode-terminal --save" para ver o QR no terminal.');
      client.on('qr', () => console.log('[WA] event=qr (aguardando scan)'));
    }

    client.on('ready', () => {
      console.log('[WA] event=ready (cliente pronto)');
    });

    client.on('authenticated', async () => {
      console.log('[WA] event=authenticated');
      try {
        const state = await client.getState();
        console.log('[WA] post-auth state=', state);
      } catch (err) {
        console.error('[WA] post-auth getState error:', err);
      }
      console.log('[WA] post-auth info=', client.info);
    });

    client.on('auth_failure', (m) => {
      console.error('[WA] event=auth_failure msg=', m);
    });

    client.on('change_state', (state) => {
      console.log('[WA] event=change_state state=', state);
    });

    client.on('disconnected', (reason) => {
      console.log('[WA] event=disconnected reason=', reason);
    });
  } finally {
    client.__listenersSet = true;
  }
}

async function initWithRetries({ tries, baseDelayMs }) {
  for (let i = 1; i <= tries; i++) {
    try {
      prepareProfileDir(sessionPath);
      await client.initialize();
      return;
    } catch (err) {
      const isNet =
        ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(err?.code);
      const isTimeout =
        /ProtocolError|TimeoutError|timed out/i.test(err?.message) || err?.name === 'TimeoutError';

      const transient = isNet || isTimeout || err?.name === 'TargetCloseError';
      const errInfo = {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
        code: err?.code,
      };
      console.warn(
        `[init] attempt=${i} transient=${!!transient} err=${err?.message}`,
        { name: errInfo.name, code: errInfo.code, stack: errInfo.stack }
      );
      logger.error(
        JSON.stringify({
          event: 'init.retry_error',
          attempt: i,
          transient: !!transient,
          ...errInfo,
        })
      );

      if (!transient || i === tries) throw err;

      const delay = baseDelayMs * 2 ** (i - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

initWithRetries({ tries: 8, baseDelayMs: 1500 });

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

client.on('authenticated', async () => {
  io.emit('authenticated', 'Server Authenticated!');
  io.emit('message', 'Server Authenticated!');
  console.log('Server Authenticated!');
  try {
    const state = await client.getState();
    console.log('Post-auth state:', state);
  } catch (err) {
    console.error('Post-auth getState error:', err);
  }
  console.log('Post-auth info:', client.info);
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

// Send message (com validação e logs seguros)
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
  const errors = validationResult(req).formatWith(({ msg }) => msg);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = Util.formatPhoneNumber(req.body.number);
  const message = req.body.message;

  // Verifica se o client está pronto
  if (!client?.info) {
    console.error('[send-message] client not ready');
    return res.status(503).json({
      status: false,
      message: 'WhatsApp client não está pronto. Escaneie o QR e aguarde READY.'
    });
  }

  try {
    console.info('[send-message] tentando enviar',
      { to: Util.maskNumber(number), preview: Util.trunc(message) });

    const response = await client.sendMessage(number, message);

    console.info('[send-message] enviado com sucesso',
      { to: Util.maskNumber(number), id: response?.id?._serialized || response?.id || null });

    return res.status(200).json({
      status: true,
      message: 'Message sent successfully.',
      response
    });
  } catch (err) {
    // Log seguro: não expõe mensagem inteira nem número completo
    console.error('[send-message] falha no envio',
      { to: Util.maskNumber(number), error: err?.message || String(err) });

    return res.status(500).json({
      status: false,
      message: 'Message not sent.',
      error: err?.message || String(err)
    });
  }
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
