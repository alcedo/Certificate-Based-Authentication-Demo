const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { validateClientCertificate, logCertificateDetails } = require('../middleware/certificate-validation');

const app = express();
const PORT = process.env.PORT || 8443;

// Middleware
app.use(express.json());
app.use(validateClientCertificate);
app.use(logCertificateDetails);

// Routes
app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello! Certificate authentication successful.',
    certificate: {
      subject: req.clientCertificate.subject,
      issuer: req.clientCertificate.issuer,
      fingerprint: req.clientCertificate.fingerprint,
      valid_from: req.clientCertificate.valid_from,
      valid_to: req.clientCertificate.valid_to
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// HTTPS server configuration
const serverOptions = {
  key: fs.readFileSync(path.join(__dirname, '..', 'certs', 'server-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '..', 'certs', 'server-cert.pem')),
  ca: fs.readFileSync(path.join(__dirname, '..', 'certs', 'ca-cert.pem')),
  requestCert: true,
  rejectUnauthorized: false // We handle authorization in middleware
};

// Start server
const server = https.createServer(serverOptions, app);

server.listen(PORT, () => {
  console.log(`🚀 HTTPS Server running on port ${PORT}`);
  console.log(`📋 Certificate validation enabled with whitelist`);
  console.log(`🔗 Try: curl -k --cert certs/client-cert.pem --key certs/client-key.pem https://localhost:${PORT}/api/hello`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});