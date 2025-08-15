const path = require('path');

/**
 * Server configuration settings
 */
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 8443,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // SSL/TLS settings
  ssl: {
    // Certificate file paths
    certsPath: path.join(__dirname, '../certs'),
    serverCert: 'server.crt',
    serverKey: 'server.key',
    caCert: 'ca.crt',
    
    // TLS configuration
    secureProtocol: 'TLSv1_2_method',
    ciphers: [
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA384'
    ],
    honorCipherOrder: true,
    
    // Client certificate settings
    requestCert: true,
    rejectUnauthorized: false // We handle validation in middleware
  },

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logsPath: path.join(__dirname, '../logs'),
    files: {
      error: 'error.log',
      combined: 'combined.log'
    },
    console: {
      enabled: true,
      colorize: true
    }
  },

  // Security settings
  security: {
    // Certificate validation settings
    certificateValidation: {
      checkExpiration: true,
      checkNotBefore: true,
      requireClientCert: true,
      logValidationDetails: true
    },
    
    // Request limits
    requestLimits: {
      maxRequestSize: '10mb',
      timeout: 30000 // 30 seconds
    }
  },

  // API settings
  api: {
    basePath: '/api',
    version: 'v1',
    endpoints: {
      health: '/health',
      hello: '/api/hello'
    }
  }
};

/**
 * Get full certificate file paths
 * @returns {Object} Certificate file paths
 */
function getCertificatePaths() {
  return {
    serverCert: path.join(config.ssl.certsPath, config.ssl.serverCert),
    serverKey: path.join(config.ssl.certsPath, config.ssl.serverKey),
    caCert: path.join(config.ssl.certsPath, config.ssl.caCert)
  };
}

/**
 * Validate configuration
 * @returns {Object} Validation result
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  // Check required environment variables
  if (!config.server.port || isNaN(config.server.port)) {
    errors.push('Invalid or missing PORT configuration');
  }

  // Check certificate paths exist
  const fs = require('fs');
  const certPaths = getCertificatePaths();
  
  Object.entries(certPaths).forEach(([name, filePath]) => {
    if (!fs.existsSync(filePath)) {
      errors.push(`Certificate file not found: ${name} at ${filePath}`);
    }
  });

  // Check logs directory
  if (!fs.existsSync(config.logging.logsPath)) {
    warnings.push(`Logs directory does not exist: ${config.logging.logsPath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get configuration for specific environment
 * @param {string} env - Environment name
 * @returns {Object} Environment-specific configuration
 */
function getEnvironmentConfig(env = config.server.environment) {
  const envConfig = { ...config };

  switch (env) {
    case 'production':
      envConfig.logging.level = 'warn';
      envConfig.logging.console.enabled = false;
      envConfig.ssl.rejectUnauthorized = true; // Stricter in production
      break;
    
    case 'development':
      envConfig.logging.level = 'debug';
      envConfig.logging.console.enabled = true;
      break;
    
    case 'test':
      envConfig.server.port = 0; // Use random port for testing
      envConfig.logging.level = 'error';
      envConfig.logging.console.enabled = false;
      break;
  }

  return envConfig;
}

module.exports = {
  config,
  getCertificatePaths,
  validateConfig,
  getEnvironmentConfig
};