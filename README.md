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

Once certificates are generated:

1. **Start the HTTPS server**:
   ```bash
   npm run start:server
   ```

2. **Test client authentication**:
   ```bash
   npm run start:client
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
