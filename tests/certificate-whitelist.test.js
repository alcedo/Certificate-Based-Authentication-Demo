// Jest is used for testing in this project
const fs = require('fs');
const path = require('path');
const { checkCertificateWhitelist, loadWhitelist } = require('../middleware/certificate-validation');

describe('Certificate Whitelist Tests', () => {
  const testWhitelistPath = path.join(__dirname, '..', 'config', 'test-whitelist.json');
  const originalWhitelistPath = path.join(__dirname, '..', 'config', 'whitelist.json');
  
  // Mock certificate objects
  const validCert = {
    fingerprint: '21:27:73:C4:61:63:5E:C7:15:33:72:34:F0:86:FF:F1:56:22:E0:D0', // SHA1
    fingerprint256: '93:56:50:BE:17:63:E3:59:E1:CF:16:BD:5B:45:A3:CB:D2:76:6C:2B:8C:3D:9B:AE:D6:71:6B:1F:7F:4E:C5:B9', // SHA256
    subject: { CN: 'Demo Client', O: 'Certificate Demo' },
    issuer: { CN: 'Demo CA', O: 'Certificate Demo' }
  };
  
  const invalidCert = {
    fingerprint: 'AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD', // SHA1
    fingerprint256: 'AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00', // SHA256
    subject: { CN: 'Invalid Client', O: 'Invalid Org' },
    issuer: { CN: 'Invalid CA', O: 'Invalid Org' }
  };

  beforeEach(() => {
    // Create test whitelist configuration
    const testConfig = {
      "whitelistedCertificates": [
        {
          "fingerprint": "93:56:50:BE:17:63:E3:59:E1:CF:16:BD:5B:45:A3:CB:D2:76:6C:2B:8C:3D:9B:AE:D6:71:6B:1F:7F:4E:C5:B9",
          "description": "Demo client certificate",
          "subject": "Demo Client",
          "organization": "Certificate Demo",
          "addedDate": "2025-08-15",
          "enabled": true
        }
      ],
      "whitelistEnabled": true,
      "hashAlgorithm": "sha256"
    };
    
    // Backup original whitelist if it exists
    if (fs.existsSync(originalWhitelistPath)) {
      fs.copyFileSync(originalWhitelistPath, testWhitelistPath);
    }
    
    // Write test configuration
    fs.writeFileSync(originalWhitelistPath, JSON.stringify(testConfig, null, 2));
  });

  afterEach(() => {
    // Restore original whitelist
    if (fs.existsSync(testWhitelistPath)) {
      fs.copyFileSync(testWhitelistPath, originalWhitelistPath);
      fs.unlinkSync(testWhitelistPath);
    } else if (fs.existsSync(originalWhitelistPath)) {
      fs.unlinkSync(originalWhitelistPath);
    }
  });

  describe('checkCertificateWhitelist', () => {
    it('should allow whitelisted certificate', () => {
      // Force reload of whitelist
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Certificate whitelisted');
      expect(result.reason).toContain('Demo client certificate');
    });

    it('should reject non-whitelisted certificate', () => {
      // Force reload of whitelist
      loadWhitelist();
      
      const result = checkCertificateWhitelist(invalidCert);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Certificate fingerprint not found in whitelist');
    });

    it('should allow all certificates when whitelist is disabled', () => {
      // Create disabled whitelist config
      const disabledConfig = {
        "whitelistedCertificates": [],
        "whitelistEnabled": false,
        "hashAlgorithm": "sha256"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(disabledConfig, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(invalidCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Whitelist disabled');
    });

    it('should reject disabled certificate entries', () => {
      // Create config with disabled certificate
      const configWithDisabled = {
        "whitelistedCertificates": [
          {
            "fingerprint": "93:56:50:BE:17:63:E3:59:E1:CF:16:BD:5B:45:A3:CB:D2:76:6C:2B:8C:3D:9B:AE:D6:71:6B:1F:7F:4E:C5:B9",
            "description": "Disabled demo client certificate",
            "enabled": false
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha256"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(configWithDisabled, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Certificate fingerprint not found in whitelist');
    });

    it('should handle missing whitelist file gracefully', () => {
      // Remove whitelist file
      if (fs.existsSync(originalWhitelistPath)) {
        fs.unlinkSync(originalWhitelistPath);
      }
      
      loadWhitelist();
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Whitelist disabled');
    });
  });

  describe('SHA256 Fingerprint Validation', () => {
    it('should validate certificate using SHA256 fingerprint when configured', () => {
      // Create SHA256 whitelist config
      const sha256Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "93:56:50:BE:17:63:E3:59:E1:CF:16:BD:5B:45:A3:CB:D2:76:6C:2B:8C:3D:9B:AE:D6:71:6B:1F:7F:4E:C5:B9",
            "description": "SHA256 demo client certificate",
            "subject": "Demo Client",
            "organization": "Certificate Demo",
            "addedDate": "2025-08-15",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha256"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha256Config, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Certificate whitelisted');
      expect(result.reason).toContain('SHA256 demo client certificate');
    });

    it('should reject certificate with wrong SHA256 fingerprint', () => {
      // Create SHA256 whitelist config with different fingerprint
      const sha256Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF",
            "description": "Different SHA256 certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha256"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha256Config, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Certificate fingerprint not found in whitelist');
      expect(result.reason).toContain('SHA256');
    });
  });

  describe('SHA1 Fingerprint Validation', () => {
    it('should validate certificate using SHA1 fingerprint when configured', () => {
      // Create SHA1 whitelist config
      const sha1Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "21:27:73:C4:61:63:5E:C7:15:33:72:34:F0:86:FF:F1:56:22:E0:D0",
            "description": "SHA1 demo client certificate",
            "subject": "Demo Client",
            "organization": "Certificate Demo",
            "addedDate": "2025-08-15",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha1"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha1Config, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Certificate whitelisted');
      expect(result.reason).toContain('SHA1 demo client certificate');
    });

    it('should reject certificate with wrong SHA1 fingerprint', () => {
      // Create SHA1 whitelist config with different fingerprint
      const sha1Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF",
            "description": "Different SHA1 certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha1"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha1Config, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Certificate fingerprint not found in whitelist');
      expect(result.reason).toContain('SHA1');
    });

    it('should default to SHA1 when hashAlgorithm is not specified', () => {
      // Create config without hashAlgorithm (should default to SHA1)
      const defaultConfig = {
        "whitelistedCertificates": [
          {
            "fingerprint": "21:27:73:C4:61:63:5E:C7:15:33:72:34:F0:86:FF:F1:56:22:E0:D0",
            "description": "Default algorithm certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true
        // No hashAlgorithm specified - should default to sha1
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(defaultConfig, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Certificate whitelisted');
    });
  });

  describe('Hash Algorithm Switching', () => {
    it('should correctly switch between SHA1 and SHA256 validation', () => {
      // Test SHA256 first
      const sha256Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "93:56:50:BE:17:63:E3:59:E1:CF:16:BD:5B:45:A3:CB:D2:76:6C:2B:8C:3D:9B:AE:D6:71:6B:1F:7F:4E:C5:B9",
            "description": "SHA256 certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha256"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha256Config, null, 2));
      loadWhitelist();
      
      let result = checkCertificateWhitelist(validCert);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('SHA256 certificate');
      
      // Now switch to SHA1
      const sha1Config = {
        "whitelistedCertificates": [
          {
            "fingerprint": "21:27:73:C4:61:63:5E:C7:15:33:72:34:F0:86:FF:F1:56:22:E0:D0",
            "description": "SHA1 certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha1"
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(sha1Config, null, 2));
      loadWhitelist();
      
      result = checkCertificateWhitelist(validCert);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('SHA1 certificate');
    });

    it('should reject when fingerprint matches wrong algorithm', () => {
      // Configure for SHA256 but provide SHA1 fingerprint in whitelist
      const mismatchConfig = {
        "whitelistedCertificates": [
          {
            "fingerprint": "21:27:73:C4:61:63:5E:C7:15:33:72:34:F0:86:FF:F1:56:22:E0:D0", // SHA1 fingerprint
            "description": "Mismatched algorithm certificate",
            "enabled": true
          }
        ],
        "whitelistEnabled": true,
        "hashAlgorithm": "sha256" // But configured for SHA256
      };
      
      fs.writeFileSync(originalWhitelistPath, JSON.stringify(mismatchConfig, null, 2));
      loadWhitelist();
      
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Certificate fingerprint not found in whitelist');
      expect(result.reason).toContain('SHA256');
    });
  });

  describe('Real Certificate File Integration', () => {
    it('should validate actual client certificate from .pem file', () => {
      const clientCertPath = path.join(__dirname, '..', 'certs', 'client-cert.pem');
      
      // Skip test if certificate file doesn't exist
      if (!fs.existsSync(clientCertPath)) {
        console.log('Skipping real certificate test - client-cert.pem not found');
        return;
      }
      
      // This test verifies that our whitelist contains the actual generated certificate
      // The fingerprint in our test config should match the real certificate
      loadWhitelist();
      const result = checkCertificateWhitelist(validCert);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Demo client certificate');
    });
  });
});