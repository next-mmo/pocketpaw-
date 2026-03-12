# Pattern A: Server-Gated Logic

Best for: SaaS-like apps, data processing, API wrappers, apps where core logic can
run server-side without latency issues.

## Architecture

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Electron App   │────→│   Casdoor    │     │  FastAPI Server   │
│   (Frontend)     │ SSO │   (Auth)     │     │  (Business Logic) │
└────────┬─────────┘     └──────────────┘     └────────┬─────────┘
         │                                             │
         │  1. OAuth2 login → get JWT token            │
         │  2. API call + token ──────────────────────→│
         │                        3. Validate JWT      │
         │                        4. Check subscription│
         │                        5. Execute logic     │
         │  6. Return result ←────────────────────────│
```

## What Goes Where

```
LOCAL (Electron + Python compiled with Nuitka):
  ├── UI / UX layer
  ├── Local caching
  ├── File I/O (open/save locally)
  ├── Preview / non-critical features
  └── Settings and preferences

SERVER (FastAPI + Casdoor):
  ├── Core business logic (the "value")
  ├── License / subscription validation
  ├── User management (via Casdoor)
  ├── Data processing endpoints
  └── Premium feature execution
```

## Implementation: FastAPI + Casdoor + Electron

### Step 1: Set Up Casdoor (Docker)

```yaml
# docker-compose.yml
version: '3'
services:
  casdoor:
    image: casbin/casdoor-all-in-one
    ports:
      - "8000:8000"
    environment:
      - RUNNING_IN_DOCKER=true
    volumes:
      - casdoor_data:/var/lib/mysql

  api:
    build: ./api
    ports:
      - "8080:8080"
    environment:
      - CASDOOR_ENDPOINT=http://casdoor:8000
      - CASDOOR_CLIENT_ID=your_client_id
      - CASDOOR_CLIENT_SECRET=your_client_secret
      - CASDOOR_CERTIFICATE=your_cert
    depends_on:
      - casdoor

volumes:
  casdoor_data:
```

### Step 2: FastAPI Server with JWT Validation

```python
# api/main.py
from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import httpx
from functools import lru_cache

app = FastAPI()
security = HTTPBearer()

# Cache Casdoor's public key
@lru_cache()
def get_casdoor_public_key():
    """Fetch Casdoor's certificate for JWT validation."""
    resp = httpx.get(f"{CASDOOR_ENDPOINT}/.well-known/openid-configuration")
    jwks_uri = resp.json()["jwks_uri"]
    jwks = httpx.get(jwks_uri).json()
    # Convert to PEM format for jwt library
    return jwks["keys"][0]

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Validate JWT token from Casdoor."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            get_casdoor_public_key(),
            algorithms=["RS256"],
            audience=CASDOOR_CLIENT_ID,
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def require_subscription(user: dict = Depends(get_current_user)):
    """Check if user has an active subscription."""
    # Option 1: Check Casdoor user properties
    if not user.get("subscription_active"):
        raise HTTPException(403, "Active subscription required")
    return user


# --- Public endpoints (no auth) ---

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# --- Protected endpoints (auth required) ---

@app.post("/api/process")
async def process_data(
    data: dict,
    user: dict = Depends(require_subscription)
):
    """This logic ONLY exists on the server."""
    result = do_expensive_processing(data)
    return {"result": result, "user": user["sub"]}


@app.post("/api/generate-report")
async def generate_report(
    params: dict,
    user: dict = Depends(require_subscription)
):
    """Premium feature — report generation."""
    report = build_report(params)  # This code never leaves the server
    return {"report": report}
```

### Step 3: Electron OAuth2 Flow

```javascript
// electron/auth.js
const { BrowserWindow } = require('electron');
const crypto = require('crypto');

const CASDOOR_CONFIG = {
  endpoint: 'https://your-casdoor.com',
  clientId: 'your_client_id',
  redirectUri: 'yourapp://callback',
  org: 'your_org',
  app: 'your_app',
};

class AuthManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Generate PKCE challenge (more secure than basic OAuth)
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return { verifier, challenge };
  }

  // Open Casdoor login window
  async login() {
    const { verifier, challenge } = this.generatePKCE();

    const authUrl = new URL(`${CASDOOR_CONFIG.endpoint}/login/oauth/authorize`);
    authUrl.searchParams.set('client_id', CASDOOR_CONFIG.clientId);
    authUrl.searchParams.set('redirect_uri', CASDOOR_CONFIG.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: { nodeIntegration: false },
      });

      authWindow.loadURL(authUrl.toString());

      // Listen for redirect
      authWindow.webContents.on('will-redirect', async (event, url) => {
        if (url.startsWith(CASDOOR_CONFIG.redirectUri)) {
          event.preventDefault();
          const code = new URL(url).searchParams.get('code');
          authWindow.close();

          try {
            const tokens = await this.exchangeCode(code, verifier);
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            resolve(tokens);
          } catch (err) {
            reject(err);
          }
        }
      });
    });
  }

  // Exchange auth code for tokens
  async exchangeCode(code, verifier) {
    const resp = await fetch(
      `${CASDOOR_CONFIG.endpoint}/api/login/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: CASDOOR_CONFIG.clientId,
          code,
          redirect_uri: CASDOOR_CONFIG.redirectUri,
          code_verifier: verifier,
        }),
      }
    );
    return resp.json();
  }

  // Make authenticated API call
  async apiCall(endpoint, data) {
    const resp = await fetch(`https://your-api.com${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(data),
    });

    if (resp.status === 401) {
      // Token expired — refresh
      await this.refreshTokens();
      return this.apiCall(endpoint, data); // Retry
    }

    return resp.json();
  }
}

module.exports = { AuthManager };
```

### Step 4: Compile Python Backend with Nuitka

```bash
# If shipping a local Python component alongside the server-gated features:
pip install nuitka

# Compile the local Python module
python -m nuitka \
  --standalone \
  --onefile \
  --include-data-dir=./assets=assets \
  --output-filename=myapp-core \
  your_local_module.py
```

## Subscription Management

### Option 1: Casdoor User Properties

Store subscription status as a custom property in Casdoor:

```python
# When user pays (webhook from Stripe/LemonSqueezy)
async def handle_payment_webhook(event):
    user_id = event["metadata"]["casdoor_user_id"]
    # Update Casdoor user property
    await casdoor_sdk.update_user(user_id, {
        "properties": {
            "subscription_active": "true",
            "plan": "pro",
            "expires_at": "2025-12-31"
        }
    })
```

### Option 2: Separate Database

```python
# subscriptions table
from sqlalchemy import Column, String, Boolean, DateTime
from database import Base

class Subscription(Base):
    __tablename__ = "subscriptions"
    user_id = Column(String, primary_key=True)  # Casdoor user ID
    plan = Column(String)  # "free", "pro", "enterprise"
    active = Column(Boolean, default=False)
    expires_at = Column(DateTime)
    stripe_customer_id = Column(String)
```

## Hosting Recommendations

For small-to-medium user bases, a single VPS handles everything:

```
$5-10/month VPS (DigitalOcean, Hetzner, etc.)
├── Casdoor (Docker)
├── FastAPI server (Docker)
├── PostgreSQL (Docker)
└── Nginx reverse proxy + Let's Encrypt SSL
```

Scale later with managed services as needed.
