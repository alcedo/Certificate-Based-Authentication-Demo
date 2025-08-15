const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { validateCertificate, getCertificateInfo } = require('../utils/certificate-validator');

describe('Certificate Generation', () => {
  const certsDir = path.join(__dirname, '..', 'certs');
  const caKeyPath = path.join(certsDir, 'ca-key.pem');
  const caCertPath = path.join(certsDir, 'ca-cert.pem');
  const serverKeyPath = path.join(certsDir, 'server-key.pem');
  const serverCertPath = path.join(certsDir, 'server-cert.pem');
  const clientKeyPath = path.join(certsDir, 'client-key.pem');
  const clientCertPath = path.join(certsDir, 'client-cert.pem');

  beforeAll(() => {
    // Clean up any existing certificates
    if (fs.existsSync(certsDir)) {
      fs.rmSync(certsDir, { recursive: true, force: true });
    }
    
    // Run certificate generation
    execSync('npm run setup', { stdio: 'inherit' });
  });

  afterAll(() => {
    // Clean up certificates after tests
    if (fs.existsSync(certsDir)) {
      fs.rmSync(certsDir, { recursive: true, force: true });
    }
  });

  describe('Certificate Files Creation', () => {
    test('should create certs directory', () => {
      expect(fs.existsSync(certsDir)).toBe(true);
      expect(fs.statSync(certsDir).isDirectory()).toBe(true);
    });

    test('should create CA private key', () => {
      expect(fs.existsSync(caKeyPath)).toBe(true);
      const stats = fs.statSync(caKeyPath);
      expect(stats.mode & parseInt('777', 8)).toBe(parseInt('600', 8)); // Check file permissions
    });

    test('should create CA certificate', () => {
      expect(fs.existsSync(caCertPath)).toBe(true);
      const caCert = fs.readFileSync(caCertPath, 'utf8');
      expect(caCert).toContain('-----BEGIN CERTIFICATE-----');
      expect(caCert).toContain('-----END CERTIFICATE-----');
    });

    test('should create server private key', () => {
      expect(fs.existsSync(serverKeyPath)).toBe(true);
      const stats = fs.statSync(serverKeyPath);
      expect(stats.mode & parseInt('777', 8)).toBe(parseInt('600', 8));
    });

    test('should create server certificate', () => {
      expect(fs.existsSync(serverCertPath)).toBe(true);
      const serverCert = fs.readFileSync(serverCertPath, 'utf8');
      expect(serverCert).toContain('-----BEGIN CERTIFICATE-----');
      expect(serverCert).toContain('-----END CERTIFICATE-----');
    });

    test('should create client private key', () => {
      expect(fs.existsSync(clientKeyPath)).toBe(true);
      const stats = fs.statSync(clientKeyPath);
      expect(stats.mode & parseInt('777', 8)).toBe(parseInt('600', 8));
    });

    test('should create client certificate', () => {
      expect(fs.existsSync(clientCertPath)).toBe(true);
      const clientCert = fs.readFileSync(clientCertPath, 'utf8');
      expect(clientCert).toContain('-----BEGIN CERTIFICATE-----');
      expect(clientCert).toContain('-----END CERTIFICATE-----');
    });
  });

  describe('Certificate Validation', () => {
    test('should validate CA certificate properties', () => {
      const caCertInfo = getCertificateInfo(caCertPath);
      expect(caCertInfo.subject.CN).toBe('Demo CA');
      expect(caCertInfo.subject.O).toBe('Certificate Demo');
      expect(caCertInfo.subject.C).toBe('US');
      expect(caCertInfo.isCA).toBe(true);
    });

    test('should validate server certificate properties', () => {
      const serverCertInfo = getCertificateInfo(serverCertPath);
      expect(serverCertInfo.subject.CN).toBe('localhost');
      expect(serverCertInfo.subject.O).toBe('Certificate Demo');
      expect(serverCertInfo.subjectAltNames).toContain('DNS:localhost');
      expect(serverCertInfo.subjectAltNames).toContain('IP:127.0.0.1');
    });

    test('should validate client certificate properties', () => {
      const clientCertInfo = getCertificateInfo(clientCertPath);
      expect(clientCertInfo.subject.CN).toBe('Demo Client');
      expect(clientCertInfo.subject.O).toBe('Certificate Demo');
      expect(clientCertInfo.subject.C).toBe('US');
    });

    test('should verify certificate chain of trust', () => {
      const isServerValid = validateCertificate(serverCertPath, caCertPath);
      expect(isServerValid).toBe(true);

      const isClientValid = validateCertificate(clientCertPath, caCertPath);
      expect(isClientValid).toBe(true);
    });

    test('should verify certificate validity period', () => {
      const serverCertInfo = getCertificateInfo(serverCertPath);
      const clientCertInfo = getCertificateInfo(clientCertPath);
      const caCertInfo = getCertificateInfo(caCertPath);

      const now = new Date();
      const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      // Check that certificates are currently valid
      expect(serverCertInfo.validFrom.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(serverCertInfo.validTo.getTime()).toBeGreaterThan(now.getTime());
      expect(clientCertInfo.validFrom.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(clientCertInfo.validTo.getTime()).toBeGreaterThan(now.getTime());
      expect(caCertInfo.validFrom.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(caCertInfo.validTo.getTime()).toBeGreaterThan(now.getTime());

      // Check that certificates expire within reasonable time (around 1 year)
      expect(serverCertInfo.validTo.getTime()).toBeLessThanOrEqual(oneYear.getTime());
      expect(clientCertInfo.validTo.getTime()).toBeLessThanOrEqual(oneYear.getTime());
      expect(caCertInfo.validTo.getTime()).toBeLessThanOrEqual(oneYear.getTime());
    });
  });

  describe('Certificate Security', () => {
    test('should use RSA 2048-bit keys', () => {
      const serverCertInfo = getCertificateInfo(serverCertPath);
      const clientCertInfo = getCertificateInfo(clientCertPath);
      const caCertInfo = getCertificateInfo(caCertPath);

      expect(serverCertInfo.publicKeySize).toBe(2048);
      expect(clientCertInfo.publicKeySize).toBe(2048);
      expect(caCertInfo.publicKeySize).toBe(2048);
    });

    test('should use SHA256 signature algorithm', () => {
      const serverCertInfo = getCertificateInfo(serverCertPath);
      const clientCertInfo = getCertificateInfo(clientCertPath);
      const caCertInfo = getCertificateInfo(caCertPath);

      expect(serverCertInfo.signatureAlgorithm).toContain('sha256');
      expect(clientCertInfo.signatureAlgorithm).toContain('sha256');
      expect(caCertInfo.signatureAlgorithm).toContain('sha256');
    });
  });
});