const fs = require('fs');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Validates a certificate against a CA certificate
 * @param {string} certPath - Path to the certificate to validate
 * @param {string} caPath - Path to the CA certificate
 * @returns {boolean} - True if certificate is valid, false otherwise
 */
function validateCertificate(certPath, caPath) {
  try {
    // Use OpenSSL to verify the certificate chain
    execSync(`openssl verify -CAfile "${caPath}" "${certPath}"`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extracts detailed information from a certificate
 * @param {string} certPath - Path to the certificate file
 * @returns {object} - Certificate information object
 */
function getCertificateInfo(certPath) {
  try {
    // Always use OpenSSL for consistent parsing and format
    return getCertificateInfoOpenSSL(certPath);
  } catch (error) {
    throw new Error(`Failed to parse certificate ${certPath}: ${error.message}`);
  }
}

/**
 * Fallback method using OpenSSL command line for certificate parsing
 * @param {string} certPath - Path to the certificate file
 * @returns {object} - Certificate information object
 */
function getCertificateInfoOpenSSL(certPath) {
  try {
    // Get certificate text output
    const certText = execSync(`openssl x509 -in "${certPath}" -text -noout`, { encoding: 'utf8' });
    
    // Get subject information
    const subjectLine = execSync(`openssl x509 -in "${certPath}" -subject -noout`, { encoding: 'utf8' });
    const issuerLine = execSync(`openssl x509 -in "${certPath}" -issuer -noout`, { encoding: 'utf8' });
    const serialLine = execSync(`openssl x509 -in "${certPath}" -serial -noout`, { encoding: 'utf8' });
    const datesOutput = execSync(`openssl x509 -in "${certPath}" -dates -noout`, { encoding: 'utf8' });
    
    // Parse subject and issuer
    const subject = parseOpenSSLDistinguishedName(subjectLine.replace('subject=', '').trim());
    const issuer = parseOpenSSLDistinguishedName(issuerLine.replace('issuer=', '').trim());
    const serialNumber = serialLine.replace('serial=', '').trim();
    
    // Parse dates
    const dateLines = datesOutput.split('\n');
    const validFrom = new Date(dateLines[0].replace('notBefore=', '').trim());
    const validTo = new Date(dateLines[1].replace('notAfter=', '').trim());
    
    // Extract Subject Alternative Names
    const sanMatch = certText.match(/X509v3 Subject Alternative Name:\s*\n\s*(.+)/i);
    const subjectAltNames = sanMatch ? sanMatch[1].split(', ').map(s => {
      const trimmed = s.trim();
      // Convert OpenSSL format to expected test format
      if (trimmed.startsWith('DNS:')) {
        return trimmed;
      } else if (trimmed.startsWith('IP Address:')) {
        return trimmed.replace('IP Address:', 'IP:');
      }
      return trimmed;
    }) : [];
    
    // Check if it's a CA certificate
    const isCA = certText.includes('CA:TRUE') || certText.includes('CA:true') || 
                 (subject.CN && issuer.CN && subject.CN === issuer.CN && subject.O === issuer.O);
    
    // Get public key size
    const publicKeySize = getPublicKeySizeOpenSSL(certPath);
    
    // Get signature algorithm
    const signatureAlgorithm = getSignatureAlgorithm(certPath);
    
    return {
      subject,
      issuer,
      serialNumber,
      validFrom,
      validTo,
      subjectAltNames,
      isCA,
      publicKeySize,
      signatureAlgorithm
    };
  } catch (error) {
    throw new Error(`Failed to parse certificate with OpenSSL ${certPath}: ${error.message}`);
  }
}

/**
 * Parses a distinguished name string into an object
 * @param {string} dnString - Distinguished name string
 * @returns {object} - Parsed DN object
 */
function parseDistinguishedName(dnString) {
  const dn = {};
  const parts = dnString.split('\n').filter(part => part.trim());
  
  parts.forEach(part => {
    const [key, value] = part.split('=').map(s => s.trim());
    if (key && value) {
      dn[key] = value;
    }
  });
  
  return dn;
}

/**
 * Parses OpenSSL format distinguished name
 * @param {string} dnString - OpenSSL DN string
 * @returns {object} - Parsed DN object
 */
function parseOpenSSLDistinguishedName(dnString) {
  const dn = {};
  // Handle OpenSSL format: /C=US/ST=Demo/L=Demo/O=Certificate Demo/OU=Demo Server/CN=localhost
  const parts = dnString.split('/');
  
  parts.forEach(part => {
    const equalIndex = part.indexOf('=');
    if (equalIndex > 0) {
      const key = part.substring(0, equalIndex).trim();
      const value = part.substring(equalIndex + 1).trim();
      dn[key] = value;
    }
  });
  
  return dn;
}

/**
 * Gets the public key size from a certificate
 * @param {object|string} certOrPath - Certificate object or path
 * @returns {number} - Public key size in bits
 */
function getPublicKeySize(certOrPath) {
  if (typeof certOrPath === 'string') {
    return getPublicKeySizeOpenSSL(certOrPath);
  }
  
  // For Node.js X509Certificate object
  try {
    const keyObject = crypto.createPublicKey(certOrPath);
    return keyObject.asymmetricKeySize * 8; // Convert bytes to bits
  } catch (error) {
    return 0;
  }
}

/**
 * Gets public key size using OpenSSL
 * @param {string} certPath - Path to certificate
 * @returns {number} - Public key size in bits
 */
function getPublicKeySizeOpenSSL(certPath) {
  try {
    const output = execSync(`openssl x509 -in "${certPath}" -text -noout`, { encoding: 'utf8' });
    const match = output.match(/RSA Public-Key:\s*\((\d+)\s+bit\)/);
    return match ? parseInt(match[1]) : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Gets the signature algorithm from a certificate
 * @param {string} certPath - Path to certificate
 * @returns {string} - Signature algorithm
 */
function getSignatureAlgorithm(certPath) {
  try {
    const output = execSync(`openssl x509 -in "${certPath}" -text -noout | grep "Signature Algorithm:"`, { encoding: 'utf8' });
    const lines = output.split('\n');
    const firstLine = lines[0].trim();
    return firstLine.replace('Signature Algorithm:', '').trim();
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Checks if a certificate is expired
 * @param {string} certPath - Path to the certificate file
 * @returns {boolean} - True if certificate is expired
 */
function isCertificateExpired(certPath) {
  try {
    const certInfo = getCertificateInfo(certPath);
    const now = new Date();
    const validTo = new Date(certInfo.validTo);
    return now > validTo;
  } catch (error) {
    return true; // Consider invalid certificates as expired
  }
}

/**
 * Checks if a certificate is not yet valid
 * @param {string} certPath - Path to the certificate file
 * @returns {boolean} - True if certificate is not yet valid
 */
function isCertificateNotYetValid(certPath) {
  try {
    const certInfo = getCertificateInfo(certPath);
    const now = new Date();
    const validFrom = new Date(certInfo.validFrom);
    return now < validFrom;
  } catch (error) {
    return true; // Consider invalid certificates as not yet valid
  }
}

module.exports = {
  validateCertificate,
  getCertificateInfo,
  isCertificateExpired,
  isCertificateNotYetValid
};