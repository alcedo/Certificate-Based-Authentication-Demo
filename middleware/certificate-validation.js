const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Load whitelist configuration
let whitelistConfig = null;
const WHITELIST_PATH = path.join(__dirname, '..', 'config', 'whitelist.json');

/**
 * Load whitelist configuration from file
 */
function loadWhitelist() {
  try {
    if (fs.existsSync(WHITELIST_PATH)) {
      const data = fs.readFileSync(WHITELIST_PATH, 'utf8');
      whitelistConfig = JSON.parse(data);
      logger.info('Whitelist configuration loaded', {
        certificateCount: whitelistConfig.whitelistedCertificates?.length || 0,
        enabled: whitelistConfig.whitelistEnabled,
        whitelist: whitelistConfig.whitelistedCertificates,
        config: whitelistConfig
      });
    } else {
      logger.warn('Whitelist configuration file not found', { path: WHITELIST_PATH });
      whitelistConfig = { whitelistEnabled: false, whitelistedCertificates: [] };
    }
  } catch (error) {
    logger.error('Failed to load whitelist configuration', {
      error: error.message,
      path: WHITELIST_PATH
    });
    whitelistConfig = { whitelistEnabled: false, whitelistedCertificates: [] };
  }
}

/**
 * Check if certificate is in whitelist
 * @param {Object} clientCert - Client certificate object
 * @returns {Object} - { allowed: boolean, reason: string }
 */
/**
 * Get the appropriate fingerprint based on whitelist configuration
 * @param {Object} clientCert - Client certificate object
 * @returns {string} - The fingerprint to use for comparison
 */
function getClientFingerprint(clientCert) {
  // Load whitelist if not already loaded
  if (!whitelistConfig) {
    loadWhitelist();
  }
  
  const hashAlgorithm = whitelistConfig.hashAlgorithm || 'sha1';
  
  if (hashAlgorithm.toLowerCase() === 'sha256') {
    return clientCert.fingerprint256;
  } else {
    return clientCert.fingerprint;
  }
}

function checkCertificateWhitelist(clientCert) {
  // Load whitelist if not already loaded
  if (!whitelistConfig) {
    loadWhitelist();
  }

  // If whitelist is disabled, allow all certificates
  if (!whitelistConfig.whitelistEnabled) {
    return { allowed: true, reason: 'Whitelist disabled' };
  }

  // Get the appropriate fingerprint based on configured hash algorithm
  const clientFingerprint = getClientFingerprint(clientCert);
  const hashAlgorithm = whitelistConfig.hashAlgorithm || 'sha1';

  // Check if certificate fingerprint is in whitelist
  const whitelistedCerts = whitelistConfig.whitelistedCertificates || [];
  const matchingCert = whitelistedCerts.find(cert => 
    cert.enabled && cert.fingerprint === clientFingerprint
  );

  if (matchingCert) {
    return { 
      allowed: true, 
      reason: `Certificate whitelisted: ${matchingCert.description || 'No description'}` 
    };
  }

  return { 
    allowed: false, 
    reason: `Certificate fingerprint not found in whitelist (using ${hashAlgorithm.toUpperCase()}: ${clientFingerprint})` 
  };
}

// Configure logger for certificate validation
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'certificate-validation' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Middleware to validate client certificates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateClientCertificate(req, res, next) {
  try {
    logger.info('Certificate validation started', {
      ip: req.ip,
      userAgent: req.get ? req.get('User-Agent') : 'unknown'
    });

    // Check if client certificate is present
    let clientCert;
    try {
      clientCert = req.connection.getPeerCertificate();
    } catch (error) {
      logger.error('Failed to get peer certificate', { error: error.message });
      return res.status(401).json({
        error: 'Client certificate validation failed',
        details: 'Certificate parsing failed'
      });
    }

    // Check if certificate exists and has required fields
    if (!clientCert || !clientCert.subject || Object.keys(clientCert.subject).length === 0) {
      logger.warn('No client certificate provided', {
        ip: req.ip,
        hasConnection: !!req.connection,
        authorized: req.socket ? req.socket.authorized : false
      });
      
      return res.status(401).json({
        error: 'Client certificate validation failed',
        details: 'No client certificate provided'
      });
    }

    // Check if socket is authorized by TLS layer
    if (!req.socket.authorized) {
      logger.warn('Client certificate not authorized by TLS layer', {
        ip: req.ip,
        subject: clientCert.subject,
        authorizationError: req.socket.authorizationError
      });
    }

    // Validate certificate dates
    const now = new Date();
    const validFrom = new Date(clientCert.valid_from);
    const validTo = new Date(clientCert.valid_to);

    if (now < validFrom) {
      logger.warn('Client certificate not yet valid', {
        ip: req.ip,
        subject: clientCert.subject,
        validFrom: clientCert.valid_from,
        currentTime: now.toISOString()
      });
      
      return res.status(401).json({
        error: 'Client certificate validation failed',
        details: `Certificate not yet valid. Valid from: ${clientCert.valid_from}`
      });
    }

    if (now > validTo) {
      logger.warn('Client certificate expired', {
        ip: req.ip,
        subject: clientCert.subject,
        validTo: clientCert.valid_to,
        currentTime: now.toISOString()
      });
      
      return res.status(401).json({
        error: 'Client certificate validation failed',
        details: `Certificate expired. Valid until: ${clientCert.valid_to}`
      });
    }

    // Additional validation for socket authorization
    if (!req.socket.authorized) {
      logger.warn('Certificate validation failed - socket not authorized', {
        ip: req.ip,
        subject: clientCert.subject,
        authorizationError: req.socket.authorizationError
      });
      
      return res.status(401).json({
        error: 'Client certificate validation failed',
        details: req.socket.authorizationError || 'Certificate not trusted'
      });
    }

    // Check certificate against whitelist
    const whitelistCheck = checkCertificateWhitelist(clientCert);
    if (!whitelistCheck.allowed) {
      logger.warn('Certificate not in whitelist', {
        ip: req.ip,
        subject: clientCert.subject,
        fingerprint: getClientFingerprint(clientCert),
        reason: whitelistCheck.reason
      });
      
      return res.status(403).json({
        error: 'Certificate not authorized',
        details: whitelistCheck.reason
      });
    }

    // Certificate is valid - attach to request object
    req.clientCertificate = {
      subject: clientCert.subject,
      issuer: clientCert.issuer,
      serialNumber: clientCert.serialNumber,
      fingerprint: getClientFingerprint(clientCert),
      valid_from: clientCert.valid_from,
      valid_to: clientCert.valid_to,
      valid: true
    };

    logger.info('Client certificate validation successful', {
      ip: req.ip,
      subject: clientCert.subject,
      issuer: clientCert.issuer,
      fingerprint: getClientFingerprint(clientCert)
    });

    next();
  } catch (error) {
    logger.error('Unexpected error during certificate validation', {
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    
    return res.status(500).json({
      error: 'Internal server error during certificate validation',
      details: 'Please contact administrator'
    });
  }
}

/**
 * Middleware to log certificate details for educational purposes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function logCertificateDetails(req, res, next) {
  if (req.clientCertificate) {
    logger.info('Certificate details for educational purposes', {
      ip: req.ip,
      certificateDetails: {
        subject: req.clientCertificate.subject,
        issuer: req.clientCertificate.issuer,
        serialNumber: req.clientCertificate.serialNumber,
        fingerprint: req.clientCertificate.fingerprint,
        validFrom: req.clientCertificate.valid_from,
        validTo: req.clientCertificate.valid_to
      }
    });
  }
  next();
}

/**
 * Get certificate information for response
 * @param {Object} req - Express request object
 * @returns {Object} Certificate information object
 */
function getCertificateInfo(req) {
  if (!req.clientCertificate) {
    return null;
  }

  return {
    subject: req.clientCertificate.subject,
    issuer: req.clientCertificate.issuer,
    serialNumber: req.clientCertificate.serialNumber,
    fingerprint: req.clientCertificate.fingerprint,
    validFrom: req.clientCertificate.valid_from,
    validTo: req.clientCertificate.valid_to,
    isValid: req.clientCertificate.valid
  };
}

module.exports = {
  validateClientCertificate,
  logCertificateDetails,
  getCertificateInfo,
  checkCertificateWhitelist,
  loadWhitelist,
  getClientFingerprint,
  logger
};