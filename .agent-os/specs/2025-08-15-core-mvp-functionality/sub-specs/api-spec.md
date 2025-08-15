# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-15-core-mvp-functionality/spec.md

## Endpoints

### GET /api/hello

**Purpose:** Demonstrate successful certificate-based authentication with a simple response
**Authentication:** Requires valid client certificate presented during TLS handshake
**Parameters:** None
**Response:** JSON object with success message and certificate details
**Errors:** 401 (Unauthorized), 403 (Forbidden), 500 (Internal Server Error)

#### Success Response (200)
```json
{
  "message": "Hello! Certificate authentication successful",
  "timestamp": "2025-08-15T10:30:00.000Z",
  "clientCert": {
    "subject": {
      "CN": "Demo Client",
      "O": "Certificate Demo",
      "C": "US"
    },
    "issuer": {
      "CN": "Demo CA",
      "O": "Certificate Demo",
      "C": "US"
    },
    "serialNumber": "01",
    "validFrom": "2025-08-15T00:00:00.000Z",
    "validTo": "2026-08-15T00:00:00.000Z"
  }
}
```

#### Error Responses

**401 Unauthorized - No Certificate Presented**
```json
{
  "error": "Client certificate required",
  "message": "No client certificate was presented during the TLS handshake",
  "timestamp": "2025-08-15T10:30:00.000Z"
}
```

**403 Forbidden - Invalid Certificate**
```json
{
  "error": "Certificate validation failed",
  "message": "Client certificate is invalid or not trusted",
  "details": "Certificate not signed by trusted CA",
  "timestamp": "2025-08-15T10:30:00.000Z"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error",
  "message": "An error occurred while processing the request",
  "timestamp": "2025-08-15T10:30:00.000Z"
}
```

## Controllers

### Certificate Validation Middleware

**Action:** `validateClientCertificate`
**Business Logic:** 
- Extract client certificate from TLS connection
- Verify certificate signature against trusted CA
- Check certificate expiration date
- Validate certificate chain of trust
- Log authentication attempt with certificate details

**Error Handling:**
- Missing certificate: Return 401 with descriptive message
- Invalid signature: Return 403 with validation failure details
- Expired certificate: Return 403 with expiration information
- Server errors: Return 500 with generic error message

### Hello World Controller

**Action:** `getHelloWorld`
**Business Logic:**
- Extract validated certificate information from middleware
- Format certificate details for response
- Generate success response with timestamp
- Log successful authentication

**Error Handling:**
- Middleware errors: Handled by certificate validation middleware
- Response formatting errors: Return 500 with error details

## Security Considerations

- Certificate validation occurs at middleware level before reaching controllers
- Sensitive certificate details (private keys, full certificate data) are never exposed in responses
- Error messages provide enough information for debugging without revealing security details
- All API responses include timestamps for audit logging
- Request/response logging includes certificate subject for traceability