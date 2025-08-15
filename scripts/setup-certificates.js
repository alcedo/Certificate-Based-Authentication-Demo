#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Configuration
const CERTS_DIR = path.join(__dirname, '..', 'certs');
const VALIDITY_DAYS = 365;
const KEY_SIZE = 2048;

// Certificate file paths
const CA_KEY = path.join(CERTS_DIR, 'ca-key.pem');
const CA_CERT = path.join(CERTS_DIR, 'ca-cert.pem');
const SERVER_KEY = path.join(CERTS_DIR, 'server-key.pem');
const SERVER_CERT = path.join(CERTS_DIR, 'server-cert.pem');
const SERVER_CSR = path.join(CERTS_DIR, 'server-csr.pem');
const CLIENT_KEY = path.join(CERTS_DIR, 'client-key.pem');
const CLIENT_CERT = path.join(CERTS_DIR, 'client-cert.pem');
const CLIENT_CSR = path.join(CERTS_DIR, 'client-csr.pem');

/**
 * Logs a message with timestamp
 * @param {string} message - Message to log
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Checks if OpenSSL is available
 */
function checkOpenSSL() {
  try {
    execSync('openssl version', { stdio: 'pipe' });
    log('✓ OpenSSL is available');
  } catch (error) {
    console.error('❌ OpenSSL is not available. Please install OpenSSL first.');
    console.error('On macOS: brew install openssl');
    console.error('On Ubuntu/Debian: sudo apt-get install openssl');
    console.error('On Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    process.exit(1);
  }
}

/**
 * Creates the certificates directory
 */
function createCertsDirectory() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    log(`✓ Created certificates directory: ${CERTS_DIR}`);
  } else {
    log(`✓ Certificates directory already exists: ${CERTS_DIR}`);
  }
}

/**
 * Sets proper file permissions for private keys
 * @param {string} filePath - Path to the file
 */
function setSecurePermissions(filePath) {
  if (os.platform() !== 'win32') {
    fs.chmodSync(filePath, 0o600); // Read/write for owner only
    log(`✓ Set secure permissions for ${path.basename(filePath)}`);
  }
}

/**
 * Generates the Certificate Authority (CA)
 */
function generateCA() {
  log('🔐 Generating Certificate Authority (CA)...');
  
  // Generate CA private key
  execSync(`openssl genrsa -out "${CA_KEY}" ${KEY_SIZE}`, { stdio: 'pipe' });
  setSecurePermissions(CA_KEY);
  
  // Generate CA certificate
  const caSubject = '/C=US/ST=Demo/L=Demo/O=Certificate Demo/OU=Demo CA/CN=Demo CA';
  execSync(`openssl req -new -x509 -days ${VALIDITY_DAYS} -key "${CA_KEY}" -out "${CA_CERT}" -subj "${caSubject}"`, { stdio: 'pipe' });
  
  log('✓ CA certificate and key generated successfully');
}

/**
 * Generates the server certificate
 */
function generateServerCertificate() {
  log('🖥️  Generating server certificate...');
  
  // Generate server private key
  execSync(`openssl genrsa -out "${SERVER_KEY}" ${KEY_SIZE}`, { stdio: 'pipe' });
  setSecurePermissions(SERVER_KEY);
  
  // Generate server certificate signing request (CSR)
  const serverSubject = '/C=US/ST=Demo/L=Demo/O=Certificate Demo/OU=Demo Server/CN=localhost';
  execSync(`openssl req -new -key "${SERVER_KEY}" -out "${SERVER_CSR}" -subj "${serverSubject}"`, { stdio: 'pipe' });
  
  // Create server certificate extensions file
  const serverExtensions = `[v3_req]
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
`;
  
  const serverExtFile = path.join(CERTS_DIR, 'server.ext');
  fs.writeFileSync(serverExtFile, serverExtensions);
  
  // Sign server certificate with CA
  execSync(`openssl x509 -req -in "${SERVER_CSR}" -CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial -out "${SERVER_CERT}" -days ${VALIDITY_DAYS} -extensions v3_req -extfile "${serverExtFile}"`, { stdio: 'pipe' });
  
  // Clean up temporary files
  fs.unlinkSync(SERVER_CSR);
  fs.unlinkSync(serverExtFile);
  
  log('✓ Server certificate and key generated successfully');
}

/**
 * Generates the client certificate
 */
function generateClientCertificate() {
  log('👤 Generating client certificate...');
  
  // Generate client private key
  execSync(`openssl genrsa -out "${CLIENT_KEY}" ${KEY_SIZE}`, { stdio: 'pipe' });
  setSecurePermissions(CLIENT_KEY);
  
  // Generate client certificate signing request (CSR)
  const clientSubject = '/C=US/ST=Demo/L=Demo/O=Certificate Demo/OU=Demo Client/CN=Demo Client';
  execSync(`openssl req -new -key "${CLIENT_KEY}" -out "${CLIENT_CSR}" -subj "${clientSubject}"`, { stdio: 'pipe' });
  
  // Create client certificate extensions file
  const clientExtensions = `[v3_req]
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = clientAuth
`;
  
  const clientExtFile = path.join(CERTS_DIR, 'client.ext');
  fs.writeFileSync(clientExtFile, clientExtensions);
  
  // Sign client certificate with CA
  execSync(`openssl x509 -req -in "${CLIENT_CSR}" -CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial -out "${CLIENT_CERT}" -days ${VALIDITY_DAYS} -extensions v3_req -extfile "${clientExtFile}"`, { stdio: 'pipe' });
  
  // Clean up temporary files
  fs.unlinkSync(CLIENT_CSR);
  fs.unlinkSync(clientExtFile);
  
  log('✓ Client certificate and key generated successfully');
}

/**
 * Verifies all generated certificates
 */
function verifyCertificates() {
  log('🔍 Verifying generated certificates...');
  
  try {
    // Verify CA certificate
    execSync(`openssl x509 -in "${CA_CERT}" -text -noout`, { stdio: 'pipe' });
    log('✓ CA certificate is valid');
    
    // Verify server certificate against CA
    execSync(`openssl verify -CAfile "${CA_CERT}" "${SERVER_CERT}"`, { stdio: 'pipe' });
    log('✓ Server certificate is valid and trusted by CA');
    
    // Verify client certificate against CA
    execSync(`openssl verify -CAfile "${CA_CERT}" "${CLIENT_CERT}"`, { stdio: 'pipe' });
    log('✓ Client certificate is valid and trusted by CA');
    
  } catch (error) {
    console.error('❌ Certificate verification failed:', error.message);
    process.exit(1);
  }
}

/**
 * Displays certificate information
 */
function displayCertificateInfo() {
  log('📋 Certificate Information:');
  
  try {
    // Display CA certificate info
    const caInfo = execSync(`openssl x509 -in "${CA_CERT}" -subject -issuer -dates -noout`, { encoding: 'utf8' });
    console.log('\n🏛️  Certificate Authority (CA):');
    console.log(caInfo);
    
    // Display server certificate info
    const serverInfo = execSync(`openssl x509 -in "${SERVER_CERT}" -subject -issuer -dates -noout`, { encoding: 'utf8' });
    console.log('\n🖥️  Server Certificate:');
    console.log(serverInfo);
    
    // Display server SAN
    try {
      const serverSAN = execSync(`openssl x509 -in "${SERVER_CERT}" -text -noout | grep -A 1 "Subject Alternative Name"`, { encoding: 'utf8' });
      console.log('Subject Alternative Names:', serverSAN.split('\n')[1]?.trim() || 'None');
    } catch (e) {
      // SAN extraction might fail on some systems
    }
    
    // Display client certificate info
    const clientInfo = execSync(`openssl x509 -in "${CLIENT_CERT}" -subject -issuer -dates -noout`, { encoding: 'utf8' });
    console.log('\n👤 Client Certificate:');
    console.log(clientInfo);
    
  } catch (error) {
    console.error('❌ Failed to display certificate information:', error.message);
  }
}

/**
 * Main function to set up all certificates
 */
function main() {
  console.log('🚀 Certificate-Based Authentication Demo - Certificate Setup');
  console.log('=' .repeat(60));
  
  try {
    checkOpenSSL();
    createCertsDirectory();
    generateCA();
    generateServerCertificate();
    generateClientCertificate();
    verifyCertificates();
    displayCertificateInfo();
    
    console.log('\n' + '=' .repeat(60));
    log('🎉 Certificate setup completed successfully!');
    console.log('\n📁 Generated files:');
    console.log(`   • CA Certificate: ${CA_CERT}`);
    console.log(`   • CA Private Key: ${CA_KEY}`);
    console.log(`   • Server Certificate: ${SERVER_CERT}`);
    console.log(`   • Server Private Key: ${SERVER_KEY}`);
    console.log(`   • Client Certificate: ${CLIENT_CERT}`);
    console.log(`   • Client Private Key: ${CLIENT_KEY}`);
    console.log('\n🔐 Private keys are secured with 600 permissions (owner read/write only)');
    console.log('\n▶️  Next steps:');
    console.log('   1. Run "npm run start:server" to start the HTTPS server');
    console.log('   2. Run "npm run start:client" to test client authentication');
    
  } catch (error) {
    console.error('\n❌ Certificate setup failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   • Ensure OpenSSL is installed and in your PATH');
    console.error('   • Check that you have write permissions to the project directory');
    console.error('   • Try running "npm run clean" to remove existing certificates and retry');
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateCA,
  generateServerCertificate,
  generateClientCertificate,
  verifyCertificates,
  CERTS_DIR,
  CA_CERT,
  CA_KEY,
  SERVER_CERT,
  SERVER_KEY,
  CLIENT_CERT,
  CLIENT_KEY
};