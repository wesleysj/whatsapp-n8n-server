# WhatsApp API Server for n8n

Uma API REST simples baseada em [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) projetada para facilitar a integração do WhatsApp com ferramentas de automação como **n8n**, Typebot, Bubble, etc.

## 🚀 Funcionalidades

- **Autenticação Segura** via Token (Bearer).
- **Envio de Texto** (Individual e Grupos).
- **Envio de Mídia** (Imagens/Arquivos) via **URL** ou **Base64**.
- **Webhooks** para receber mensagens.
- **Multi-Sessão** (via variáveis de ambiente).

---

## 🛠️ Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=8080
SESSION_NAME=minha-sessao
API_TOKEN=meu-segredo-super-seguro
WEBHOOK_URL=https://n8n.meudominio.com/webhook/whatsapp
# Opcional: Caminho do Chrome se não detectar automaticamente
# CHROME_PATH=/usr/bin/google-chrome-stable
```

### Instalação e Execução

```bash
# Instalar dependências
npm install

# Iniciar servidor
node app-2025-12-24.js
```

Ao iniciar, verifique o console ou acesse `http://localhost:8080` (se houver interface) para escanear o QR Code.

---

## 🔐 Autenticação

Todos os endpoints (exceto health check) exigem autenticação.

**Header:**
`Authorization: Bearer meu-segredo-super-seguro`

Ou alternativamente via Query Param: `?api_key=meu-segredo-super-seguro`

---

## 📚 Documentação da API

### 1. Enviar Mensagem de Texto
**POST** `/send-message`

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `number` | `string` | Número com DDI e DDD (ex: 5511999999999) ou ID do grupo |
| `message` | `string` | Texto da mensagem |

**Exemplo de Body (JSON):**
```json
{
  "number": "5511999999999",
  "message": "Olá! Enviado via API."
}
```

---

### 2. Enviar Imagem / Mídia
**POST** `/send-image`

Este endpoint é híbrido. Você pode enviar a mídia fornecendo um **link (URL)** ou o arquivo em **Base64**.

#### Opção A: Enviar via URL (Recomendado)
O servidor fará o download da imagem e enviará.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `number` | `string` | Número de destino |
| `media.url` | `string` | Link direto da imagem/arquivo |
| `media.caption` | `string` | Legenda (Opcional) |

**Exemplo (JSON):**
```json
{
  "number": "5511999999999",
  "media": {
    "url": "https://exemplo.com/minha-foto.jpg",
    "caption": "Olha essa foto que baixei da internet!"
  }
}
```

#### Opção B: Enviar via Base64
Ideal para arquivos gerados localmente ou no n8n.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `number` | `string` | Número de destino |
| `media.data` | `string` | String Base64 do arquivo |
| `media.mimetype` | `string` | Tipo do arquivo (ex: image/jpeg, application/pdf) |
| `media.filename` | `string` | Nome do arquivo (Opcional) |
| `media.caption` | `string` | Legenda (Opcional) |

**Exemplo (JSON):**
```json
{
  "number": "5511999999999",
  "media": {
    "data": "JVBERi0xLjQKJ...", 
    "mimetype": "application/pdf",
    "filename": "boleto.pdf",
    "caption": "Segue seu boleto"
  }
}
```

---

### 3. Outros Endpoints

- **GET** `/healthz` - Verifica status do serviço.
- **POST** `/webhook` - Atualiza a URL de webhook dinamicamente.
  - Body: `{ "url": "https://..." }`

---

## 🤖 Integração com n8n

Use o nó **HTTP Request**:

1. **Method:** POST
2. **URL:** `http://seu-servidor:8080/send-image`
3. **Authentication:** Generic Credential Type -> Header Auth -> `Authorization: Bearer ...`
4. **Body:** JSON

**Dica para Base64 no n8n:**
Se usar a opção Base64, utilize o nó *Function* ou expressões para extrair o binário:
`$binary.data.data` (certifique-se de que é a string pura, o endpoint remove o prefixo `data:...` automaticamente se houver).

---

## ⚠️ Limitações Conhecidas

- **Tamanho do Payload:** Se usar Base64, certifique-se de aumentar o limite do body parser no Express (já configurado para 50mb neste projeto).
- **Sessão:** O arquivo `.wwebjs_auth` armazena a sessão. Se deletar esta pasta, será necessário escanear o QR Code novamente.
