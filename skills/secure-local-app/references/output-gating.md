# Pattern B: Output Gating

Best for: Video/photo/audio editors, creative tools, GPU-heavy apps where core
processing MUST run locally but you can gate the final output.

## Core Concept

```
Let users EDIT freely (local, fast, GPU-powered)
Lock the OUTPUT (export, save, publish requires server validation)
```

This works because:
- Editing = marketing (users fall in love with the tool)
- Exporting = value (what they actually pay for)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Electron App                     │
│                                                  │
│  ✅ LOCAL (fast, GPU):                           │
│  ├── Timeline / canvas / workspace               │
│  ├── Real-time preview + playback                │
│  ├── GPU rendering + effects                     │
│  ├── Basic free effects (bundled)                │
│  └── Project editing (in-memory)                 │
│                                                  │
│  🔒 SERVER-GATED:                                │
│  ├── Export / render final output                │
│  ├── Save / load project files (encrypted)       │
│  ├── Premium effects / templates / assets        │
│  ├── Cloud sync / collaboration                  │
│  └── AI-powered features                         │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Your FastAPI Server   │
         │  + Casdoor SSO          │
         │                         │
         │  • Validate license     │
         │  • Issue export tokens  │
         │  • Serve premium assets │
         │  • Encrypt/decrypt keys │
         └────────────────────────┘
```

## Implementation Patterns

### 1. Export Token System

The strongest pattern for editor apps. Export requires a one-time token from server.

```python
# SERVER: Issue time-limited export tokens
from datetime import datetime, timedelta
import jwt

SECRET = "your-server-secret"  # env variable in production

@app.post("/api/export/token")
async def request_export_token(
    project_meta: dict,
    user: dict = Depends(require_subscription)
):
    """Issue a signed, time-limited export token."""
    token = jwt.encode({
        "user_id": user["sub"],
        "project_id": project_meta["id"],
        "resolution": get_max_resolution(user["plan"]),  # e.g. "4k" for pro
        "formats": get_allowed_formats(user["plan"]),     # e.g. ["mp4","mov","prores"]
        "watermark": False,
        "exp": datetime.utcnow() + timedelta(minutes=30),
    }, SECRET, algorithm="HS256")

    return {"export_token": token}


@app.post("/api/export/verify")
async def verify_export_token(token: str):
    """Client calls this before starting export."""
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
        return {"valid": True, "permissions": payload}
    except jwt.ExpiredSignatureError:
        return {"valid": False, "reason": "expired"}
    except jwt.InvalidTokenError:
        return {"valid": False, "reason": "invalid"}
```

```javascript
// CLIENT: Export flow in Electron
async function exportProject(project) {
  // Step 1: Request export token from server
  const tokenResp = await auth.apiCall('/api/export/token', {
    id: project.id,
    format: 'mp4',
    resolution: '4k',
  });

  if (!tokenResp.export_token) {
    showUpgradeDialog();
    return;
  }

  // Step 2: Decode permissions from token
  const permissions = decodeToken(tokenResp.export_token);

  // Step 3: Render locally with GPU (the heavy lifting)
  const output = await gpuRenderer.render(project, {
    resolution: permissions.resolution,
    format: permissions.formats[0],
    watermark: permissions.watermark,
  });

  // Step 4: Sign the output file with the token
  await embedExportSignature(output, tokenResp.export_token);

  return output;
}
```

### 2. Watermark Degradation

Free/unlicensed users can export, but with visible watermarks.

```python
# SERVER: Return watermark config based on plan
@app.get("/api/user/export-config")
async def get_export_config(user: dict = Depends(get_current_user)):
    plan = user.get("plan", "free")

    configs = {
        "free": {
            "watermark": True,
            "watermark_text": "Made with YourApp — yourapp.com",
            "watermark_opacity": 0.3,
            "max_resolution": "720p",
            "max_duration_seconds": 60,
            "formats": ["mp4"],
        },
        "pro": {
            "watermark": False,
            "max_resolution": "4k",
            "max_duration_seconds": None,  # unlimited
            "formats": ["mp4", "mov", "prores", "gif"],
        },
    }
    return configs.get(plan, configs["free"])
```

```javascript
// CLIENT: Apply watermark if required
async function renderWithWatermark(project, exportConfig) {
  const frames = await gpuRenderer.renderFrames(project);

  if (exportConfig.watermark) {
    // Burn watermark into rendered frames (hard to remove)
    for (const frame of frames) {
      await burnWatermark(frame, {
        text: exportConfig.watermark_text,
        opacity: exportConfig.watermark_opacity,
        // Spread across frame so cropping doesn't remove it
        positions: ['center', 'top-left', 'bottom-right'],
        rotation: 30,  // diagonal — harder to clone out
      });
    }
  }

  return encodeVideo(frames, exportConfig);
}
```

### 3. Encrypted Project Files

Projects saved in encrypted format — decryption key from server.

```python
# SERVER: Project encryption key management
from cryptography.fernet import Fernet

@app.post("/api/project/save-key")
async def get_save_key(
    project_id: str,
    user: dict = Depends(require_subscription)
):
    """Generate and store a project-specific encryption key."""
    key = Fernet.generate_key()
    # Store key in DB, associated with user + project
    await db.store_project_key(user["sub"], project_id, key)
    return {"key": key.decode()}


@app.post("/api/project/load-key")
async def get_load_key(
    project_id: str,
    user: dict = Depends(require_subscription)
):
    """Retrieve decryption key for a saved project."""
    key = await db.get_project_key(user["sub"], project_id)
    if not key:
        raise HTTPException(404, "Project not found")
    return {"key": key}
```

```javascript
// CLIENT: Save/load encrypted projects
const crypto = require('crypto');

async function saveProject(project) {
  // Get encryption key from server
  const { key } = await auth.apiCall('/api/project/save-key', {
    project_id: project.id,
  });

  // Serialize project data
  const projectData = JSON.stringify(project.serialize());

  // Encrypt locally (fast)
  const encrypted = encrypt(projectData, key);

  // Save encrypted file to disk
  fs.writeFileSync(
    `${project.name}.yourapp`,  // custom extension
    encrypted
  );

  // Clear key from memory
  key = null;
}

async function loadProject(filepath) {
  const encrypted = fs.readFileSync(filepath);
  const projectId = extractProjectId(encrypted);

  // Must get key from server (requires valid auth)
  const { key } = await auth.apiCall('/api/project/load-key', {
    project_id: projectId,
  });

  const decrypted = decrypt(encrypted, key);
  return Project.deserialize(JSON.parse(decrypted));
}
```

### 4. Premium Asset Delivery

Premium effects, templates, filters served from your server.

```python
# SERVER: Premium asset catalog and delivery
@app.get("/api/assets/catalog")
async def get_asset_catalog(user: dict = Depends(get_current_user)):
    """Return catalog with availability based on plan."""
    all_assets = await db.get_all_assets()
    plan = user.get("plan", "free")

    return [{
        "id": a.id,
        "name": a.name,
        "preview_url": a.preview_url,  # low-res preview — always available
        "available": a.required_plan in get_included_plans(plan),
        "required_plan": a.required_plan,
    } for a in all_assets]


@app.get("/api/assets/{asset_id}/download")
async def download_asset(
    asset_id: str,
    user: dict = Depends(require_subscription)
):
    """Download full-quality asset (requires subscription)."""
    asset = await db.get_asset(asset_id)
    if asset.required_plan not in get_included_plans(user["plan"]):
        raise HTTPException(403, "Upgrade required for this asset")

    return StreamingResponse(
        open(asset.file_path, "rb"),
        media_type=asset.mime_type,
        headers={"X-Asset-License": sign_asset(asset_id, user["sub"])}
    )
```

## Offline Handling / Grace Period

Editor apps need some offline tolerance:

```javascript
// CLIENT: Graceful offline handling
class LicenseManager {
  constructor() {
    this.lastValidation = null;
    this.cachedPermissions = null;
    this.GRACE_PERIOD_HOURS = 72;  // work offline for 3 days
  }

  async checkLicense() {
    try {
      const resp = await auth.apiCall('/api/user/export-config');
      this.cachedPermissions = resp;
      this.lastValidation = Date.now();
      this.saveToSecureStorage();  // cache locally (encrypted)
      return resp;
    } catch (err) {
      // Offline — use cached permissions if within grace period
      if (this.isWithinGracePeriod()) {
        return this.cachedPermissions;
      }
      // Grace period expired
      return this.getFreePermissions();
    }
  }

  isWithinGracePeriod() {
    if (!this.lastValidation) return false;
    const hours = (Date.now() - this.lastValidation) / (1000 * 60 * 60);
    return hours < this.GRACE_PERIOD_HOURS;
  }

  getFreePermissions() {
    return {
      watermark: true,
      max_resolution: '720p',
      formats: ['mp4'],
    };
  }
}
```

## Real-World Examples of This Pattern

| App | Edit Locally | Server-Gated |
|-----|-------------|-------------|
| CapCut | Timeline, effects, preview | Premium templates, cloud export, AI features |
| DaVinci Resolve | Full editing + color grading | Studio: HDR, AI noise reduction, collaboration |
| Figma | Canvas rendering, editing | Saving, sharing, version history, collaboration |
| Canva | Canvas editing, text | Premium templates, resize, brand kit, export |
| Unity | Editor, scene building | Cloud build, collaboration, premium assets |

## Anti-Bypass Hardening

For editor apps, attackers typically try to:

1. **Patch the export check** → Use integrity verification (hash your export module)
2. **Fake the token** → Server-signed JWTs with short expiry
3. **Remove watermark code** → Compile with Nuitka, embed watermark deep in render pipeline
4. **Intercept premium assets** → Encrypt assets, key tied to session token
5. **Crack offline grace period** → Hardware-fingerprint the cached permission file
