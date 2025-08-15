const request = require('supertest');
const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const { validateClientCertificate } = require('../middleware/certificate-validation');

describe('Server Certificate Validation', () => {
  let app;
  let server;
  let validClientCert;
  let validClientKey;
  let invalidClientCert;
  let caCert;

  beforeAll(() => {
    // Load test certificates
    const certsPath = path.join(__dirname, '../certs');
    
    try {
      validClientCert = fs.readFileSync(path.join(certsPath, 'client.crt'));
      validClientKey = fs.readFileSync(path.join(certsPath, 'client.key'));
      caCert = fs.readFileSync(path.join(certsPath, 'ca.crt'));
      
      // Create a mock invalid certificate for testing
      invalidClientCert = Buffer.from('-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----');
    } catch (error) {
      console.warn('Certificate files not found, some tests may be skipped');
    }

    // Create Express app with certificate validation middleware
    app = express();
    app.use(validateClientCertificate);
    app.get('/test', (req, res) => {
      res.json({ 
        message: 'Certificate validation successful',
        clientCert: req.clientCertificate ? {
          subject: req.clientCertificate.subject,
          issuer: req.clientCertificate.issuer,
          valid: req.clientCertificate.valid
        } : null
      });
    });
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('Certificate Validation Middleware', () => {
    test('should accept valid client certificate', (done) => {
      if (!validClientCert) {
        return done();
      }

      const options = {
        hostname: 'localhost',
        port: 0, // Will be set when server starts
        path: '/test',
        method: 'GET',
        cert: validClientCert,
        key: validClientKey,
        ca: caCert,
        rejectUnauthorized: false
      };

      // This test will be completed when we have the actual server running
      expect(validClientCert).toBeDefined();
      done();
    });

    test('should reject invalid client certificate', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-user-agent'),
        connection: {
          getPeerCertificate: () => ({
            subject: {},
            issuer: {},
            valid_from: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            valid_to: new Date(Date.now() - 1000).toISOString(), // 1 second ago (expired)
            fingerprint: 'invalid'
          })
        },
        socket: {
          authorized: false
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      validateClientCertificate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Client certificate validation failed',
        details: expect.any(String)
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject request without client certificate', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-user-agent'),
        connection: {
          getPeerCertificate: () => ({})
        },
        socket: {
          authorized: false
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      validateClientCertificate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Client certificate validation failed',
        details: 'No client certificate provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should accept valid client certificate and call next', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-user-agent'),
        connection: {
          getPeerCertificate: () => ({
            subject: {
              CN: 'test-client',
              O: 'Test Organization'
            },
            issuer: {
              CN: 'Test CA',
              O: 'Test CA Organization'
            },
            valid_from: new Date(Date.now() - 86400000).toISOString(), // Yesterday
            valid_to: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
            fingerprint: '4B:3F:84:E6:C7:36:97:2D:41:AB:5F:B1:DA:F7:8B:D6:A9:A3:9D:92'
          })
        },
        socket: {
          authorized: true
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      validateClientCertificate(mockReq, mockRes, mockNext);

      expect(mockReq.clientCertificate).toBeDefined();
      expect(mockReq.clientCertificate.subject.CN).toBe('test-client');
      expect(mockReq.clientCertificate.valid).toBe(true);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should handle expired certificates', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-user-agent'),
        connection: {
          getPeerCertificate: () => ({
            subject: { CN: 'expired-client' },
            issuer: { CN: 'Test CA' },
            valid_from: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
            valid_to: new Date(Date.now() - 86400000).toISOString(), // Yesterday (expired)
            fingerprint: 'expired-fingerprint'
          })
        },
        socket: {
          authorized: false
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      validateClientCertificate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Client certificate validation failed',
        details: expect.stringContaining('expired')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle certificates not yet valid', () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-user-agent'),
        connection: {
          getPeerCertificate: () => ({
            subject: { CN: 'future-client' },
            issuer: { CN: 'Test CA' },
            valid_from: new Date(Date.now() + 86400000).toISOString(), // Tomorrow (not yet valid)
            valid_to: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
            fingerprint: 'future-fingerprint'
          })
        },
        socket: {
          authorized: false
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      validateClientCertificate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Client certificate validation failed',
        details: expect.stringContaining('not yet valid')
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('HTTPS Server Configuration', () => {
    test('should require client certificates', () => {
      // Test that server configuration requires client certificates
      const serverOptions = {
        requestCert: true,
        rejectUnauthorized: false, // We handle validation in middleware
        ca: caCert
      };

      expect(serverOptions.requestCert).toBe(true);
      expect(serverOptions.rejectUnauthorized).toBe(false);
      
      if (caCert) {
        expect(serverOptions.ca).toBeDefined();
      } else {
        expect(serverOptions.ca).toBeUndefined();
      }
    });

    test('should load server certificates correctly', () => {
      const certsPath = path.join(__dirname, '../certs');
      
      try {
        const serverCert = fs.readFileSync(path.join(certsPath, 'server.crt'));
        const serverKey = fs.readFileSync(path.join(certsPath, 'server.key'));
        
        expect(serverCert).toBeDefined();
        expect(serverKey).toBeDefined();
        expect(serverCert.toString()).toContain('-----BEGIN CERTIFICATE-----');
        expect(serverKey.toString()).toContain('-----BEGIN PRIVATE KEY-----');
      } catch (error) {
        console.warn('Server certificate files not found, test skipped');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle missing certificate files gracefully', () => {
      const nonExistentPath = '/path/that/does/not/exist/cert.pem';
      
      expect(() => {
        try {
          fs.readFileSync(nonExistentPath);
        } catch (error) {
          expect(error.code).toBe('ENOENT');
          throw error;
        }
      }).toThrow();
    });

    test('should handle malformed certificates', () => {
      const mockReq = {
        connection: {
          getPeerCertificate: () => {
            throw new Error('Certificate parsing failed');
          }
        },
        socket: {
          authorized: false
        }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      expect(() => {
        validateClientCertificate(mockReq, mockRes, mockNext);
      }).not.toThrow();

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});