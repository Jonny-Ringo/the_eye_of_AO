# Nginx Setup for oracle.jonny-ringo.xyz

This guide sets up Nginx as a reverse proxy for the Arweave Blockheight Tracker API.

## Prerequisites

- VPS: 137.184.115.211
- Domain: oracle.jonny-ringo.xyz
- Node.js service running on port 3001

---

## 1. DNS Configuration

Point your domain to the VPS:

```
A Record: oracle.jonny-ringo.xyz -> 137.184.115.211
```

Wait for DNS propagation (check with `dig oracle.jonny-ringo.xyz`).

---

## 2. Install Nginx

```bash
ssh root@137.184.115.211

# Update package list
apt update

# Install Nginx
apt install nginx -y

# Check status
systemctl status nginx
```

---

## 3. Configure Nginx

Create a new site configuration:

```bash
nano /etc/nginx/sites-available/oracle.jonny-ringo.xyz
```

**Configuration:**

```
server {
    listen 80;
    server_name oracle.jonny-ringo.xyz;

    # Redirect to HTTPS (enabled after SSL setup)
    return 301 https://$server_name$request_uri;
}

server {
    server_name oracle.jonny-ringo.xyz;

    # Block all other routes - only expose API
    location / {
        return 404;
    }

    # Only expose blockheights API endpoints (publicly accessible)
    location /api/blockheights/ {
        proxy_pass http://127.0.0.1:3001/api/blockheights/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers REMOVED - Node.js handles CORS based on ALLOW_LOCALHOST setting
        # This prevents duplicate CORS headers conflict
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/oracle.jonny-ringo.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oracle.jonny-ringo.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

---

## 4. Enable Site

```bash
# Create symlink to enable site
ln -s /etc/nginx/sites-available/oracle.jonny-ringo.xyz /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

---

## 5. Setup SSL with Let's Encrypt

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
certbot --nginx -d oracle.jonny-ringo.xyz

# Follow prompts:
# - Enter email address
# - Agree to Terms of Service
# - Choose whether to redirect HTTP to HTTPS (recommended: Yes)

# Verify auto-renewal
certbot renew --dry-run
```

**After SSL setup, Certbot will automatically update your Nginx config to:**
- Listen on port 443 (HTTPS)
- Redirect HTTP (port 80) to HTTPS
- Add SSL certificates and security headers

---

## 6. Apply Updated Nginx Configuration

To fix the CORS conflict, apply the updated configuration on VPS:

```bash
# SSH to VPS
ssh root@137.184.115.211

# Edit the Nginx config
nano /etc/nginx/sites-available/oracle.jonny-ringo.xyz

# Copy the configuration from step 3 above (without CORS headers)

# Test configuration
nginx -t

# Reload Nginx (no downtime)
systemctl reload nginx
```

**Important**: Do NOT change `ALLOW_LOCALHOST` in `.env` - leave it as `true` for local development. Node.js now handles all CORS logic.

---

## 7. Firewall Configuration

```bash
# Allow HTTP and HTTPS
ufw allow 'Nginx Full'

# Check status
ufw status
```

If UFW is not enabled:
```bash
ufw enable
ufw allow ssh
ufw allow 'Nginx Full'
```

---

## 8. Test the Setup

**HTTP (before SSL):**
```bash
curl http://oracle.jonny-ringo.xyz/health
curl http://oracle.jonny-ringo.xyz/api/blockheights/latest
```

**HTTPS (after SSL):**
```bash
curl https://oracle.jonny-ringo.xyz/health
curl https://oracle.jonny-ringo.xyz/api/blockheights/latest
curl https://oracle.jonny-ringo.xyz/api/blockheights/daily?days=5
```

**From browser:**
```
https://oracle.jonny-ringo.xyz/api/blockheights/latest
https://oracle.jonny-ringo.xyz/api/blockheights/daily?days=30
```

---

## 9. Update Frontend Configuration

Update `dev/config.js` to use the new domain:

```javascript
// VPS Oracle Configuration
export const VPS_ORACLE_ENDPOINT = 'https://oracle.jonny-ringo.xyz';
export const BLOCKHEIGHT_API = `${VPS_ORACLE_ENDPOINT}/api/blockheights`;
```

---

## Nginx Management Commands

```bash
# Check status
systemctl status nginx

# Start Nginx
systemctl start nginx

# Stop Nginx
systemctl stop nginx

# Restart Nginx
systemctl restart nginx

# Reload configuration (no downtime)
systemctl reload nginx

# Test configuration
nginx -t

# View error logs
tail -f /var/log/nginx/error.log

# View access logs
tail -f /var/log/nginx/access.log

# View site-specific logs (if configured)
tail -f /var/log/nginx/oracle.jonny-ringo.xyz.access.log
```

---

## SSL Certificate Renewal

Certbot sets up automatic renewal, but you can manually renew:

```bash
# Test renewal process
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal

# Check certificate expiration
certbot certificates
```

---

## Troubleshooting

**502 Bad Gateway:**
- Check if Node.js service is running: `ps aux | grep node`
- Check Node.js logs: `tail -f /root/arweave-blockheight-tracker/logs/diagnostics.log`
- Verify port 3001 is listening: `netstat -tulpn | grep 3001`

**DNS not resolving:**
- Check DNS propagation: `dig oracle.jonny-ringo.xyz`
- Wait up to 24 hours for full propagation

**SSL certificate issues:**
- Ensure port 80 is accessible during certificate issuance
- Check firewall: `ufw status`
- Verify domain points to correct IP: `nslookup oracle.jonny-ringo.xyz`

**CORS errors:**
- Ensure Nginx config does NOT have CORS headers (Node.js handles CORS)
- Verify `ALLOW_LOCALHOST=true` in `/root/arweave-blockheight-tracker/.env`
- Restart Node.js service if needed
- Check browser console for specific CORS error details

---

## Security Considerations

**Rate Limiting (Optional):**

Add to Nginx config inside `http` block:

```nginx
# /etc/nginx/nginx.conf
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # ... other config ...
}
```

Then in your site config:

```nginx
location /api/ {
    limit_req zone=api burst=20 nodelay;

    # ... rest of proxy config ...
}
```

**IP Whitelisting (Optional):**

To restrict access to specific IPs:

```nginx
location /api/ {
    allow 1.2.3.4;      # Your IP
    allow 5.6.7.8/24;   # IP range
    deny all;

    # ... rest of proxy config ...
}
```

---

## Summary

After setup, your API will be accessible at:

- **Health check:** `https://oracle.jonny-ringo.xyz/health`
- **Latest block:** `https://oracle.jonny-ringo.xyz/api/blockheights/latest`
- **Daily blocks:** `https://oracle.jonny-ringo.xyz/api/blockheights/daily?days=30`

The Nginx reverse proxy provides:
- SSL/TLS encryption
- Clean domain name
- CORS handling
- Request logging
- Optional rate limiting and security features
