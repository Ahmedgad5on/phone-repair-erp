# ProLab Central Licensing Server — Production Deployment Guide

## 1. System Requirements & Architecture

The Central Licensing Server is built with **FastAPI**, **Pydantic v2**, and **Cryptography (Ed25519 / Argon2id)**. It can run on either **Ubuntu 22.04 LTS / Debian 12** or **Windows Server 2022**.

### Recommended Hardware:
- **CPU:** 2 vCPU cores (Intel Xeon or AMD EPYC)
- **RAM:** 2 GB to 4 GB
- **Disk:** 40 GB NVMe SSD (Release packages storage)
- **Network:** Static Public IP with Ports 80 and 443 open.

---

## 2. Directory Layout & Key Protection

The server stores its persisted state in `server_data/`:
```
/opt/prolab-server/
├── server/
│   ├── config.py
│   ├── database.py
│   ├── security.py
│   ├── routers/
│   └── templates/
├── server_data/
│   ├── keys/
│   │   ├── ed25519_private.pem  <-- CHMOD 600 (Strictly Protected)
│   │   └── ed25519_public.pem   <-- CHMOD 644
│   ├── releases/                <-- Downloadable EXE/Zip update packages
│   └── licensing.db             <-- SQLite WAL Database (or PostgreSQL connection)
└── requirements.txt
```

> [!CAUTION]
> **Ed25519 Private Key Protection Rule:**
> `ed25519_private.pem` is the master root of trust for all issued licenses. It must NEVER be checked into public Git repositories, and must NEVER be embedded inside customer desktop EXEs. Permissions must be set to `chmod 600`.

---

## 3. Containerized Deployment (Docker & Docker Compose)

### 3.1 `Dockerfile`
Create `/opt/prolab-server/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ server/

ENV THERMALLAB_SERVER_DATA=/app/server_data
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8000

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 3.2 `docker-compose.yml`
Create `/opt/prolab-server/docker-compose.yml`:
```yaml
version: '3.8'

services:
  licensing-server:
    build: .
    restart: always
    environment:
      - SERVER_SECRET_KEY=generate-a-strong-random-64-char-secret-here
      - ACCESS_TOKEN_EXPIRE_MINUTES=60
      - REFRESH_TOKEN_EXPIRE_DAYS=30
      - REGISTRATION_POLICY=PHONE_AND_ADMIN_APPROVAL
      - OTP_PROVIDER=mock # or twilio / infobip in production
      - WHATSAPP_SUPPORT_PHONE=+201012345678
      - OFFLINE_GRACE_HOURS=168
    volumes:
      - ./server_data:/app/server_data
    ports:
      - "127.0.0.1:8000:8000"

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - licensing-server
```

---

## 4. Production Nginx Reverse Proxy Configuration

Create `/opt/prolab-server/nginx.conf`:
```nginx
server {
    listen 80;
    server_name licensing.prolab.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name licensing.prolab.com;

    ssl_certificate /etc/letsencrypt/live/licensing.prolab.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/licensing.prolab.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 150M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static update release downloads
    location /api/v1/updates/download/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

---

## 5. Systemd Service Deployment (Bare Metal / VM)

If running directly without Docker:

Create `/etc/systemd/system/prolab-licensing.service`:
```ini
[Unit]
Description=ProLab Central Licensing Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/prolab-server
Environment="PATH=/opt/prolab-server/venv/bin"
Environment="THERMALLAB_SERVER_DATA=/opt/prolab-server/server_data"
Environment="SERVER_HOST=0.0.0.0"
Environment="SERVER_PORT=8000"
Environment="SERVER_SECRET_KEY=generate-strong-64-character-hex-secret"

ExecStart=/opt/prolab-server/venv/bin/uvicorn server.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable prolab-licensing
sudo systemctl start prolab-licensing
sudo systemctl status prolab-licensing
```

---

## 6. Verification and Health Check

After launching, verify that the health endpoint returns `healthy`:
```bash
curl -i https://licensing.prolab.com/api/v1/health
```
Expected output:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp_utc": "2026-11-14T18:00:00Z"
}
```
Access the Owner Admin Dashboard in your browser:
`https://licensing.prolab.com/admin/dashboard`
Log in using `superadmin` and the configured administrator password.
