# Whatsapp N8N Server
A small server to run in localhost that provides some endpoints to access Whatsapp API client.

It uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) library.

## Installation

Clone this repository: `git clone https://github.com/wesleysj/whatsapp-n8n-server.git`

Install dependencies: `npm install` 


## Run server

`npm start`


## Conect device

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

## Endpoints

### /send-message

Send a message to one contact.

- Method: POST

### /chats

Get all chats (groups included).

- Method: GET

### /group-participants

Get all participants in a chat group.- Method: GET
