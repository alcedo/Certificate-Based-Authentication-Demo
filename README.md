# Certificate-Based-Authentication-Demo

Demo application showcasing certificate-based authentication using Node.js, Express, and OpenSSL.

## Prerequisites

Before running the certificate setup, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **OpenSSL** (required for certificate generation)

### Installing OpenSSL

- **macOS**: `brew install openssl`
- **Ubuntu/Debian**: `sudo apt-get install openssl`
- **Windows**: Download from [Win32/Win64 OpenSSL](https://slproweb.com/products/Win32OpenSSL.html)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Certificates

Run the certificate setup script to generate all required certificates:

```bash
npm run setup
```

Or run the script directly:

```bash
node scripts/setup-certificates.js
```

#### What the Setup Script Does

The `setup-certificates.js` script will:

1. **Check OpenSSL availability** - Verifies that OpenSSL is installed and accessible
2. **Create certificates directory** - Creates a `certs/` folder in the project root
3. **Generate Certificate Authority (CA)**:
   - CA private key (`ca-key.pem`)
   - CA certificate (`ca-cert.pem`)
4. **Generate Server Certificate**:
   - Server private key (`server-key.pem`)
   - Server certificate (`server-cert.pem`) with Subject Alternative Names (localhost, 127.0.0.1)
5. **Generate Client Certificate**:
   - Client private key (`client-key.pem`)
   - Client certificate (`client-cert.pem`)
6. **Verify all certificates** - Ensures certificates are valid and properly signed
7. **Set secure permissions** - Sets 600 permissions on private keys (Unix/macOS only)

#### Generated Files

After successful execution, you'll find these files in the `certs/` directory:

```
certs/
├── ca-cert.pem      # Certificate Authority certificate
├── ca-key.pem       # Certificate Authority private key
├── server-cert.pem  # Server certificate (for HTTPS)
├── server-key.pem   # Server private key
├── client-cert.pem  # Client certificate (for authentication)
└── client-key.pem   # Client private key
```

### 3. Verify Setup

Run the test suite to verify everything is working correctly:

```bash
npm test
```

## Usage

### 1. Start the Server

Start the HTTPS server with certificate validation:

```bash
npm run start:server
```

The server will start on `https://localhost:8443` with:
- TLS/SSL encryption enabled
- Client certificate validation
- Certificate whitelist verification

### 2. Generate a Client Certificate

If you need to generate additional client certificates beyond the default ones:

```bash
# Generate a new client certificate (requires OpenSSL)
openssl genrsa -out certs/new-client-key.pem 2048
openssl req -new -key certs/new-client-key.pem -out certs/new-client.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=New Client"
openssl x509 -req -in certs/new-client.csr -CA certs/ca-cert.pem -CAkey certs/ca-key.pem -CAcreateserial -out certs/new-client-cert.pem -days 365 -sha256
rm certs/new-client.csr
```

Or use the existing client certificate generated during setup:
- `certs/client-cert.pem` (certificate)
- `certs/client-key.pem` (private key)

### 3. Add Client Certificate to Whitelist

To allow a client certificate to access the server, you need to add its fingerprint to the whitelist:

#### Step 3.1: Get the Certificate Fingerprint

```bash
# Get SHA256 fingerprint of your client certificate
openssl x509 -noout -fingerprint -sha256 -in certs/client-cert.pem
```

This will output something like:
```
SHA256 Fingerprint=4B:3F:84:E6:C7:36:97:2D:41:AB:5F:B1:DA:F7:8B:D6:A9:A3:9D:92
```

#### Step 3.2: Update config/whitelist.json

Add the certificate to `config/whitelist.json`:

```json
{
  "whitelistedCertificates": [
    {
      "fingerprint": "4B:3F:84:E6:C7:36:97:2D:41:AB:5F:B1:DA:F7:8B:D6:A9:A3:9D:92",
      "description": "Demo client certificate",
      "subject": "Demo Client",
      "organization": "Certificate Demo",
      "addedDate": "2025-08-15",
      "enabled": true
    },
    {
      "fingerprint": "YOUR_NEW_CERTIFICATE_FINGERPRINT_HERE",
      "description": "New client certificate",
      "subject": "New Client",
      "organization": "Your Organization",
      "addedDate": "2025-08-15",
      "enabled": true
    }
  ],
  "whitelistEnabled": true,
  "hashAlgorithm": "sha256"
}
```

**Note**: The server automatically reloads the whitelist configuration, so you don't need to restart it after updating the file.

### 4. Test the /api/hello Endpoint

Once your client certificate is whitelisted, test the API endpoint:

#### Option A: Using curl (Recommended)

```bash
# Test with client certificate authentication
curl -v \
  --cert certs/client-cert.pem \
  --key certs/client-key.pem \
  --cacert certs/ca-cert.pem \
  https://localhost:8443/api/hello
```

**Expected Response (Success)**:
```json
{
  "message": "Hello! Client certificate authenticated successfully.",
  "clientCertificate": {
    "subject": "Demo Client",
    "issuer": "Demo CA",
    "serialNumber": "...",
    "fingerprint": "4B:3F:84:E6:C7:36:97:2D:41:AB:5F:B1:DA:F7:8B:D6:A9:A3:9D:92"
  }
}
```

**Expected Response (Certificate Not Whitelisted)**:
```json
{
  "error": "Client certificate not whitelisted",
  "fingerprint": "XX:XX:XX:..."
}
```

#### Option C: Test Without Certificate (Should Fail)

```bash
# This should return an error since no client certificate is provided
curl -v --cacert certs/ca-cert.pem https://localhost:8443/api/hello
```

### Whitelist Management

#### Enable/Disable Whitelist

To temporarily disable certificate whitelisting, set `whitelistEnabled` to `false` in `config/whitelist.json`:

```json
{
  "whitelistEnabled": false,
  ...
}
```

#### Disable Specific Certificates

To temporarily disable a specific certificate without removing it from the whitelist:

```json
{
  "fingerprint": "4B:3F:84:E6:C7:36:97:2D:41:AB:5F:B1:DA:F7:8B:D6:A9:A3:9D:92",
  "enabled": false,
  ...
}
```

## Troubleshooting

If you encounter issues:

1. **OpenSSL not found**: Ensure OpenSSL is installed and in your system PATH
2. **Permission errors**: Make sure you have write permissions to the project directory
3. **Certificate errors**: Try cleaning and regenerating certificates:
   ```bash
   npm run clean
   npm run setup
   ```

## Security Notes

- Private keys are automatically secured with 600 permissions (owner read/write only)
- Certificates are valid for 365 days
- All certificates use RSA 2048-bit keys with SHA256 signature algorithm
- Server certificate includes Subject Alternative Names for localhost and 127.0.0.1
