module.exports = {
  apps: [
    {
      name: 'whatsapp-n8n-server',
      script: './app.js',
      watch: false,
      env: {
        PORT: 8080,
        API_TOKEN: process.env.API_TOKEN_WA, // pega do .profile
      },
      // Use /healthz for PM2 healthchecks
      health_check: {
        url: 'http://localhost:8080/healthz',
        interval: 5000,
        timeout: 5000,
      },
    },
  ],
};
