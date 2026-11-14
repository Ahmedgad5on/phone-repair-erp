"""
server/main.py — Main FastAPI Application Entrypoint & Gateway
Assembles all API routers, security middleware, exception handlers, and the Owner Dashboard Web UI.
"""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from typing import Dict, Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server.config import config
from server.database import CentralDatabaseManager
from server.security import Ed25519LicensingEngine
from server.routers import (
    auth, customer, licensing, subscriptions, devices, payments, updates, admin
)

logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("licensing_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: initialize database, pre-generate Ed25519 keys, verify setup."""
    logger.info("Initializing ProLab Central Licensing Server...")
    # Initialize DB & Ed25519 Keypair
    db = CentralDatabaseManager.get_instance()
    Ed25519LicensingEngine.get_or_create_keys()
    logger.info("Server cryptographic and database foundations active.")
    yield
    logger.info("Shutting down licensing server.")


app = FastAPI(
    title="ThermalLabPro Commercial ERP Licensing & SaaS Engine",
    description="Enterprise Licensing, Customer Management, Device Activation, and Auto-Updates Gateway.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware (permits requests from web dashboard and desktop client)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API v1 Routers
app.include_router(auth.router)
app.include_router(customer.router)
app.include_router(licensing.router)
app.include_router(subscriptions.router)
app.include_router(devices.router)
app.include_router(payments.router)
app.include_router(updates.router)
app.include_router(admin.router)


@app.get("/health", tags=["Health & Diagnostics"])
@app.get("/api/v1/health", tags=["Health & Diagnostics"])
def health_check():
    """Health check endpoint for container orchestrators, load balancers, and uptime monitors."""
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()
    cur.execute("SELECT 1;")
    db_ok = cur.fetchone()[0] == 1

    return {
        "status": "healthy" if db_ok else "unhealthy",
        "service": "ThermalLabPro Central Licensing Server",
        "version": "1.0.0",
        "database": "connected" if db_ok else "error",
        "ed25519_key_id": config.ED25519_KEY_ID
    }


# ==============================================================================
# Owner Admin Dashboard Web UI Endpoint
# ==============================================================================

@app.get("/dashboard", response_class=HTMLResponse, tags=["Owner Admin Dashboard"])
@app.get("/admin/dashboard", response_class=HTMLResponse, tags=["Owner Admin Dashboard"])
def render_owner_dashboard():
    """Serves the complete responsive Owner Administration Web Console."""
    template_path = Path(__file__).parent / "templates" / "dashboard.html"
    if template_path.exists():
        with open(template_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Owner Admin Dashboard template loading...</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.main:app", host=config.HOST, port=config.PORT, reload=config.DEBUG)
