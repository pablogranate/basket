# nginx: serve portal static assets directly

Node must never serve static bytes in prod (ADR 0005, rule 7). A prod trace
(2026-07-03) caught a 12KB immutable JS chunk waiting **1228ms** because the
single Node process was busy rendering an RSC response. These location blocks
make nginx serve hashed build assets and team logos straight from disk.

nginx config lives on the VPS (not in this repo). Add the blocks to the
`portal.basket-app.com` server block — each subdomain has its own server block
and cert; do not touch the others.

## Location blocks

Paths assume the deploy root `/opt/basket-app` (pm2 app id 3).

```nginx
# Hashed Next.js build assets — immutable by construction (content-hashed
# filenames), safe to cache for a year. alias maps /_next/static/* to the
# build output directly, bypassing Node.
location /_next/static/ {
    alias /opt/basket-app/.next/static/;
    access_log off;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Team crest images — large, stable directories under public/. NOT immutable
# (a logo file can be replaced under the same name), so 30 days.
location ~ ^/(Logos|LogosPNG)/ {
    root /opt/basket-app/public;
    access_log off;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
}
```

Everything else keeps proxying to the Node port as today.

## Apply (manual, on the VPS)

1. Edit the portal server block, paste the two locations **above** the
   `location /` proxy block.
2. `nginx -t` — must pass before any reload.
3. Verify against the running config without reloading yet: pick a real chunk
   URL from the live app (view-source → any `/_next/static/chunks/*.js`).
4. `systemctl reload nginx` (reload, not restart).

## Verify

```bash
# Served by nginx with immutable caching, no Next/Node headers:
curl -sI https://portal.basket-app.com/_next/static/chunks/<hash>.js | \
  grep -iE "cache-control|x-powered-by|server"
# expect: Cache-Control: public, immutable — and NO x-powered-by

curl -sI "https://portal.basket-app.com/LogosPNG/Logos%20Liga%20Nacional%20500%20x%20500/Quimsa.png" | \
  grep -i cache-control
# expect: Cache-Control: public, max-age=2592000
```

A 404 on a chunk URL means the `alias` path is wrong — that breaks the whole
app UI. Fix or remove the block and reload again.

## Rollback

Remove the two location blocks, `nginx -t`, `systemctl reload nginx`. The Node
process serves the same paths itself (that's today's behavior), so rollback is
loss-free.

## Deploy interaction

`.next/static` keeps old hashed chunks only until the next build replaces the
directory. Because filenames are content-hashed, a client on a stale HTML
document may request a chunk that a fresh build deleted. Same failure mode as
today (Node returns 404 too) — the standard fix remains a page reload. No
change to the deploy flow (`pull → build → pm2 restart`) is needed.

If a future format-change moves the deploy root, update the `alias`/`root`
paths here and on the VPS together.
