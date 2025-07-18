# Whatsapp N8N Server
A small server to run in localhost that provides some endpoints to access Whatsapp API client.

It uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) library.

## Installation


Clone this repository: `git clone https://github.com/wesleysj/whatsapp-n8n-server.git`

Install dependencies: `npm install`

## Prerequisites

This project uses Puppeteer through `whatsapp-web.js`. Chromium requires a few
system libraries on Ubuntu/Debian. Install them before running the server:

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libgtk-3-0 \
  libnss3 \
  lsb-release \
  xdg-utils \
  libxss1
```

Run these commands before executing `npm start`.


## Run server

`npm start`


## Connect device

Open a web browser `http://localhost:8080` and scan the QRCode.

## Authentication

Generate a token with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the server with the token exported as `API_TOKEN`:

```
API_TOKEN=<token> npm start
```

Include this token in requests using the `Authorization` header or `api_key` query parameter.

Optionally define `WEBHOOK_URL` to automatically forward incoming messages to this URL:

```
WEBHOOK_URL=https://example.com/webhook npm start
```

You can update this value later using the `/webhook` endpoint.

## Endpoints

### /send-message

Send a message to one contact.

- Method: POST

### /chats

Get all chats (groups included).

- Method: GET

### /group-participants

Get all participants in a chat group.

- Method: GET

### /webhook

Configure the URL that will receive incoming WhatsApp messages.

- Method: POST
- Body:

```
{
  "url": "https://example.com/webhook"
}
```

#### Payload sent to the webhook

When set, every incoming message triggers a POST request to the configured URL with the following JSON body:

```
{
  "id": "<message id>",
  "from": "<sender>",
  "to": "<receiver>",
  "body": "<message text>"
}
```
