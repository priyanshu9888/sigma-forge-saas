"""
FigmaForge SaaS Backend
=======================
FastAPI backend with:
  - Supabase Auth (JWT validation)
  - Usage limits per plan (Free: 3/mo, Pro: unlimited)
  - Stripe payment integration
  - Generation endpoint wired to the core engine
"""

import os, uuid, shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Optional .env loading for local development
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

# ── Core FigmaForge engine (from the CLI project) ──────────────────────────
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "figmaforge" / "backend"))

try:
    from figma_client import FigmaClient, FigmaAPIError
    from parser import DesignParser
    from version_manager import VersionCompatibilityEngine
    from project_builder import ProjectBuilder
    from generators.react_generator import ReactGenerator
    from generators.nextjs_generator import NextjsGenerator
    from generators.vue_generator import VueGenerator
    from generators.flutter_generator import FlutterGenerator
    from generators.swiftui_generator import SwiftUIGenerator
    ENGINE_AVAILABLE = True
except ImportError:
    ENGINE_AVAILABLE = False

app = FastAPI(title="FigmaForge SaaS API", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

PROJECTS_DIR = Path("projects")
PROJECTS_DIR.mkdir(exist_ok=True)

# ── Plan limits ────────────────────────────────────────────────────────────
PLAN_LIMITS = {
    "free":  {"generations_per_month": 3,  "frameworks": ["react", "nextjs"]},
    "pro":   {"generations_per_month": -1, "frameworks": ["react","nextjs","vue","flutter","swiftui"]},
    "team":  {"generations_per_month": -1, "frameworks": ["react","nextjs","vue","flutter","swiftui"]},
}

GENERATORS = {
    "react": ReactGenerator if ENGINE_AVAILABLE else None,
    "nextjs": NextjsGenerator if ENGINE_AVAILABLE else None,
    "vue": VueGenerator if ENGINE_AVAILABLE else None,
    "flutter": FlutterGenerator if ENGINE_AVAILABLE else None,
    "swiftui": SwiftUIGenerator if ENGINE_AVAILABLE else None,
}


# ── Pydantic models ────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    figma_url: str
    framework: str
    version: str
    styling: Optional[str] = "tailwind"
    tailwind_version: Optional[str] = "3"
    package_manager: Optional[str] = "npm"
    figma_token: str
    ai_optimize: Optional[bool] = False

class CheckoutRequest(BaseModel):
    plan: str   # pro | team
    success_url: str
    cancel_url: str
    currency: Optional[str] = None


# ── Auth helpers ───────────────────────────────────────────────────────────

def get_supabase_client():
    """Return a Supabase client. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars."""
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            return None
        return create_client(url, key)
    except ImportError:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Validate Supabase JWT token from Authorization: Bearer <token> header.
    Returns user dict with id, email, plan.
    Falls back to demo user if Supabase is not configured.
    """
    if not authorization or not authorization.startswith("Bearer "):
        # Demo mode — allow unauthenticated with free plan
        return {"id": "demo-user", "email": "demo@example.com", "plan": "free", "usage": 0}

    token = authorization.replace("Bearer ", "")
    sb = get_supabase_client()
    if not sb:
        # No Supabase configured — demo mode
        return {"id": "demo-user", "email": "demo@example.com", "plan": "free", "usage": 0}

    try:
        user = sb.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        # Get plan from profiles table
        profile = sb.table("profiles").select("plan, monthly_usage").eq("id", user.user.id).single().execute()
        plan = profile.data.get("plan", "free") if profile.data else "free"
        usage = profile.data.get("monthly_usage", 0) if profile.data else 0

        return {"id": user.user.id, "email": user.user.email, "plan": plan, "usage": usage}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


def check_usage_limit(user: dict, framework: str):
    """Raise 403 if user has exceeded their plan limits."""
    plan = user.get("plan", "free")
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

    # Framework access
    if framework not in limits["frameworks"]:
        raise HTTPException(
            status_code=403,
            detail=f"Framework '{framework}' requires Pro plan. "
                   f"Your plan: {plan}. Upgrade at /pricing"
        )

    # Generation count
    max_gen = limits["generations_per_month"]
    if max_gen > 0 and user.get("usage", 0) >= max_gen:
        raise HTTPException(
            status_code=403,
            detail=f"You've used all {max_gen} free generations this month. "
                   f"Upgrade to Pro for unlimited at /pricing"
        )


def increment_usage(user_id: str):
    """Increment the user's monthly generation counter in Supabase."""
    sb = get_supabase_client()
    if not sb or user_id == "demo-user":
        return
    try:
        sb.rpc("increment_usage", {"user_id": user_id}).execute()
    except Exception:
        pass  # Non-fatal


def log_generation(user_id: str, req: GenerateRequest, files_count: int, project_id: str):
    """Persist generation metadata for the user's history."""
    sb = get_supabase_client()
    if not sb or user_id == "demo-user":
        return
    try:
        sb.table("generations").insert({
            "user_id": user_id,
            "figma_url": req.figma_url,
            "framework": req.framework,
            "version": req.version,
            "styling": req.styling,
            "tailwind_ver": req.tailwind_version,
            "package_mgr": req.package_manager,
            "files_count": files_count,
            "project_id": project_id,
        }).execute()
    except Exception:
        pass  # Non-fatal


def extract_file_key(figma_url: str) -> str:
    import re
    for pattern in [r"figma\.com/file/([a-zA-Z0-9]+)", r"figma\.com/design/([a-zA-Z0-9]+)"]:
        m = re.search(pattern, figma_url)
        if m:
            return m.group(1)
    return figma_url


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"name": "FigmaForge SaaS API", "version": "1.0.0", "engine": ENGINE_AVAILABLE}


@app.post("/generate")
async def generate(req: GenerateRequest, user: dict = Depends(get_current_user)):
    """Main generation endpoint. Validates plan, runs engine, returns download URL."""

    check_usage_limit(user, req.framework)

    if not ENGINE_AVAILABLE:
        # Demo mode — return mock response
        project_id = str(uuid.uuid4())[:8]
        return {
            "status": "success",
            "project_id": project_id,
            "download_url": f"/download/{project_id}",
            "warnings": ["Demo mode: FigmaForge engine not connected. Run the CLI backend."],
            "framework_info": {"next": "14.2.3", "react": "18.2.0", "tailwindcss": "3.4.1"},
            "files_generated": 8,
        }

    file_key = extract_file_key(req.figma_url)

    # Fetch Figma
    try:
        client = FigmaClient(req.figma_token)
        raw = client.get_file(file_key)
    except FigmaAPIError as e:
        raise HTTPException(status_code=400, detail=f"Figma API error: {e}")

    # Parse
    parser = DesignParser()
    tree = parser.parse(raw)

    # Version check
    vc = VersionCompatibilityEngine()
    compat = vc.check(req.framework, req.version, req.styling, req.tailwind_version)
    if compat["errors"]:
        raise HTTPException(status_code=400, detail="; ".join(compat["errors"]))

    resolved_tw = compat.get("resolved_tailwind_version", req.tailwind_version)

    # Generate
    GenClass = GENERATORS.get(req.framework)
    if not GenClass:
        raise HTTPException(status_code=400, detail=f"Generator for '{req.framework}' not available")

    generator = GenClass(version=req.version, styling=req.styling, tailwind_version=resolved_tw)
    files = generator.generate(tree)

    # Build project
    project_id = str(uuid.uuid4())[:8]
    project_path = PROJECTS_DIR / project_id
    builder = ProjectBuilder(req.framework, req.version, req.styling, resolved_tw, req.package_manager)
    builder.build(project_path, files, tree)
    shutil.make_archive(str(PROJECTS_DIR / project_id), "zip", str(project_path))

    # Store generation metadata
    log_generation(user["id"], req, len(files), project_id)

    # Increment usage
    increment_usage(user["id"])

    return {
        "status": "success",
        "project_id": project_id,
        "download_url": f"/download/{project_id}",
        "warnings": compat.get("warnings", []),
        "framework_info": compat.get("resolved", {}),
        "files_generated": len(files),
    }


@app.get("/download/{project_id}")
async def download(project_id: str):
    """Download the generated zip file."""
    zip_path = PROJECTS_DIR / f"{project_id}.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Project not found or expired (files kept for 5 mins)")
    return FileResponse(str(zip_path), media_type="application/zip",
                        filename=f"figmaforge-{project_id}.zip")


@app.get("/me")
async def me(user: dict = Depends(get_current_user)):
    """Return current user info + usage."""
    plan = user.get("plan", "free")
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    return {
        "id": user["id"],
        "email": user["email"],
        "plan": plan,
        "usage": {
            "current": user.get("usage", 0),
            "limit": limits["generations_per_month"],
            "frameworks": limits["frameworks"],
        },
    }


@app.post("/checkout")
async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Create a Stripe checkout session."""
    try:
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe.api_key:
            return {"url": "/pricing", "message": "Stripe not configured"}

        PRICE_IDS = {
            "pro":  os.getenv("STRIPE_PRICE_PRO",  "price_pro_monthly"),
            "team": os.getenv("STRIPE_PRICE_TEAM", "price_team_monthly"),
        }

        currency = (req.currency or "").upper()
        price_id = None
        if currency:
            env_key = f"STRIPE_PRICE_{req.plan.upper()}_{currency}"
            price_id = os.getenv(env_key)
        if not price_id:
            price_id = PRICE_IDS.get(req.plan)
        if not price_id:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {req.plan}")

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            client_reference_id=user["id"],
            customer_email=user.get("email"),
            metadata={"user_id": user["id"], "plan": req.plan, "currency": currency or "USD"},
        )
        return {"url": session.url}

    except ImportError:
        return {"url": f"/pricing?plan={req.plan}", "message": "Install stripe: pip install stripe"}


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook to update user plan after payment."""
    import hmac, hashlib
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret:
        try:
            import stripe
            stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
            event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        import json
        event = json.loads(payload)

    sb = get_supabase_client()
    if sb and event["type"] in ("checkout.session.completed", "customer.subscription.updated"):
        data = event["data"]["object"]
        user_id = data.get("client_reference_id") or data.get("metadata", {}).get("user_id")
        plan = data.get("metadata", {}).get("plan", "pro")
        if user_id:
            sb.table("profiles").upsert({"id": user_id, "plan": plan}).execute()

    if sb and event["type"] == "customer.subscription.deleted":
        data = event["data"]["object"]
        user_id = data.get("metadata", {}).get("user_id")
        if user_id:
            sb.table("profiles").upsert({"id": user_id, "plan": "free"}).execute()

    return {"received": True}


@app.get("/versions/{framework}")
async def framework_versions(framework: str):
    """Return supported versions for a framework."""
    from version_manager import VersionCompatibilityEngine
    return VersionCompatibilityEngine().supported_versions(framework)


@app.get("/compatibility")
async def check_compatibility(framework: str, version: str,
                              styling: str = "tailwind", tailwind_version: str = "3"):
    from version_manager import VersionCompatibilityEngine
    return VersionCompatibilityEngine().check(framework, version, styling, tailwind_version)
