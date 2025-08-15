#!/usr/bin/env node

const { startServer } = require('../server/index');
const { validateConfig, getEnvironmentConfig } = require('../server/config');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Configure startup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Pre-flight checks before starting the server
 */
function performPreflightChecks() {
  logger.info('🔍 Performing pre-flight checks...');

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 14) {
    logger.error(`❌ Node.js version ${nodeVersion} is not supported. Please use Node.js 14 or higher.`);
    process.exit(1);
  }
  logger.info(`✅ Node.js version: ${nodeVersion}`);

  // Validate configuration
  const validation = validateConfig();
  
  if (!validation.valid) {
    logger.error('❌ Configuration validation failed:');
    validation.errors.forEach(error => logger.error(`   - ${error}`));
    process.exit(1);
  }
  
  if (validation.warnings.length > 0) {
    logger.warn('⚠️  Configuration warnings:');
    validation.warnings.forEach(warning => logger.warn(`   - ${warning}`));
  }
  
  logger.info('✅ Configuration validation passed');

  // Check certificates
  const config = getEnvironmentConfig();
  const certsPath = config.ssl.certsPath;
  
  const requiredCerts = [
    { name: 'CA Certificate', file: 'ca.crt' },
    { name: 'Server Certificate', file: 'server.crt' },
    { name: 'Server Private Key', file: 'server.key' }
  ];

  let certsValid = true;
  requiredCerts.forEach(cert => {
    const certPath = path.join(certsPath, cert.file);
    if (fs.existsSync(certPath)) {
      logger.info(`✅ ${cert.name}: ${cert.file}`);
    } else {
      logger.error(`❌ ${cert.name} not found: ${cert.file}`);
      certsValid = false;
    }
  });

  if (!certsValid) {
    logger.error('❌ Required certificates are missing.');
    logger.info('💡 Run "npm run setup" to generate certificates.');
    process.exit(1);
  }

  // Ensure logs directory exists
  const logsDir = config.logging.logsPath;
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    logger.info(`📁 Created logs directory: ${logsDir}`);
  }

  logger.info('✅ All pre-flight checks passed');
}

/**
 * Display startup banner
 */
function displayBanner() {
  const config = getEnvironmentConfig();
  
  console.log('\n' + '='.repeat(60));
  console.log('🔒 Certificate-Based Authentication Demo Server');
  console.log('='.repeat(60));
  console.log(`Environment: ${config.server.environment}`);
  console.log(`Port: ${config.server.port}`);
  console.log(`Log Level: ${config.logging.level}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Display post-startup information
 */
function displayPostStartupInfo() {
  const config = getEnvironmentConfig();
  const port = config.server.port;
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Server Started Successfully!');
  console.log('='.repeat(60));
  console.log('📋 Available Endpoints:');
  console.log(`   Health Check: https://localhost:${port}/health`);
  console.log(`   Hello API:    https://localhost:${port}/api/hello`);
  console.log('');
  console.log('🔧 Testing with curl:');
  console.log(`   curl -k --cert certs/client.crt --key certs/client.key \\`);
  console.log(`        https://localhost:${port}/api/hello`);
  console.log('');
  console.log('📝 Logs:');
  console.log(`   Error Log:    ${path.join(config.logging.logsPath, config.logging.files.error)}`);
  console.log(`   Combined Log: ${path.join(config.logging.logsPath, config.logging.files.combined)}`);
  console.log('');
  console.log('⚠️  Note: Client certificate is required for all endpoints');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main startup function
 */
function main() {
  try {
    // Handle command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log('\nCertificate-Based Authentication Demo Server\n');
      console.log('Usage: node scripts/start-server.js [options]\n');
      console.log('Options:');
      console.log('  --help, -h     Show this help message');
      console.log('  --check, -c    Run pre-flight checks only');
      console.log('  --version, -v  Show version information');
      console.log('');
      console.log('Environment Variables:');
      console.log('  PORT           Server port (default: 8443)');
      console.log('  NODE_ENV       Environment (development|production|test)');
      console.log('  LOG_LEVEL      Logging level (debug|info|warn|error)');
      console.log('');
      return;
    }
    
    if (args.includes('--version') || args.includes('-v')) {
      const packageJson = require('../package.json');
      console.log(`${packageJson.name} v${packageJson.version}`);
      return;
    }
    
    if (args.includes('--check') || args.includes('-c')) {
      performPreflightChecks();
      logger.info('✅ Pre-flight checks completed successfully');
      return;
    }

    // Normal startup process
    displayBanner();
    performPreflightChecks();
    
    logger.info('🚀 Starting HTTPS server...');
    const server = startServer();
    
    // Display post-startup info after a short delay
    setTimeout(() => {
      displayPostStartupInfo();
    }, 1000);
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error.message);
    if (process.env.NODE_ENV === 'development') {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

module.exports = { main, performPreflightChecks, displayBanner };