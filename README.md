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

All requests require an API token. Generate a token with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Insert your API Token on your ~/.profile file

```
export API_TOKEN_WA="your token here"
```

You can do this with:

```
echo 'export API_TOKEN_WA="your_token_here"' >> ~/.profile
source ~/.profile
```

Start the server with via pm2 with token 

```
pm2 start ecosystem.config.js
```

Requests without this token, or with an invalid token, receive an `HTTP 401` response. Include the token using the `Authorization` header or `api_key` query parameter.

Optionally define `WEBHOOK_URL` to automatically forward incoming messages to this URL:

```
WEBHOOK_URL=https://example.com/webhook npm start
```

You can update this value later using the `/webhook` endpoint.

Define optional variables `SESSION_NAME` and `DATA_PATH` to run multiple independent sessions:

```
SESSION_NAME=my-session DATA_PATH=/path/to/data npm start
```

If `DATA_PATH` is omitted, a `.wwebjs_auth` folder is created inside the project
directory by default.

The server aborts on start if another process is using the same `DATA_PATH`.

## Health check

The server exposes `GET /healthz` which reports readiness. Use this route for
health checks in Nginx or PM2. Example configuration files `nginx.conf` and
`ecosystem.config.js` are provided.

## Endpoints

### /healthz

Health check endpoint. Returns status `200` only when the WhatsApp client is ready;
otherwise responds with `503`.

- Method: GET

### /send-message

Send a message to one contact.

- Method: POST
- Body:

```
{
  "number": "5511987654321",
  "message": "Hello from the API"
}
```

`number` must contain only digits. Provide the full international phone number
without `+` or separators (for example, `5511987654321` for a São Paulo, Brazil
number). The server automatically converts it to the WhatsApp `@c.us` format and
adds the ninth digit for Brazilian mobile numbers when required. The `message`
field is the text body that will be delivered to the recipient.

### /send-group-message

Send a message to a WhatsApp group.

- Method: POST
- Body:

```
{
  "groupId": "1203xxxxxxxx-xxxxxxxxxx@g.us",
  "message": "Hello group from the API"
}
```

`groupId` must be a valid WhatsApp group id ending in `@g.us` (use `/chats` or
`/group-participants` to discover the id of a group). The `message` field is
the text body that will be delivered to the group.

### /chats

Get all chats (groups included).

- Method: GET

### /group-participants

Get all participants in a chat group.

- Method: GET

### /webhook

Configure the URL that will receive incoming WhatsApp messages.

The provided URL must be a valid HTTP or HTTPS address.

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

## 📸 Enviar Mídia (Imagens/Arquivos)

O endpoint `/send-image` permite enviar imagens, arquivos ou documentos para contatos e grupos. Ele aceita duas formas de envio:
1. **URL:** O servidor baixa o arquivo automaticamente e envia (Recomendado).
2. **Base64:** O conteúdo do arquivo é enviado diretamente no corpo da requisição.

**Endpoint:** `POST /send-image`
**Auth:** Requer Header `Authorization: Bearer SEU_TOKEN`

### ⚠️ Configuração Importante (Limite de Tamanho)
Por padrão, o servidor aceita apenas requisições pequenas (aprox. 100kb). Para enviar imagens via **Base64**, você deve aumentar o limite do `body-parser` no seu arquivo `app.js`:

```javascript
// Procure onde o express.json() é iniciado e altere para:
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
```
*Se não fizer isso, envios em Base64 retornarão erro `413 Payload Too Large`.*

---

### Exemplo 1: Enviando via URL (Mais leve)
Ideal para enviar arquivos que já estão na internet. O payload é pequeno e rápido.

```json
{
  "number": "5511999999999",
  "media": {
    "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/1200px-WhatsApp.svg.png",
    "caption": "Olha essa imagem enviada via link!"
  }
}
```

### Exemplo 2: Enviando via Base64
Ideal para arquivos locais ou gerados dinamicamente (ex: n8n, Typebot).

```json
{
  "number": "5511999999999",
  "media": {
    "mimetype": "image/png",
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",
    "filename": "imagem.png",
    "caption": "Imagem enviada via código Base64"
  }
}
```

#### Parâmetros do Objeto `media`:
| Campo | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `url` | string | Sim* | Link direto do arquivo (se não usar `data`). |
| `data` | string | Sim* | Conteúdo em Base64 (se não usar `url`). |
| `mimetype` | string | Não | Tipo do arquivo (ex: `image/jpeg`). Necessário apenas se usar Base64. |
| `filename` | string | Não | Nome do arquivo que aparecerá para o usuário. |
| `caption` | string | Não | Texto/Legenda que acompanha a mídia. |

*\* É obrigatório fornecer ou `url` ou `data`.*
