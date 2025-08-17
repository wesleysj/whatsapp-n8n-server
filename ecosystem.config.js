module.exports = {
  apps: [
    {
      name: 'whatsapp-n8n-server',
      script: './app.js',
      watch: false,
      env: {
        PORT: 8080,
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
