#!/usr/bin/env sh
set -eu

DOMAIN=${DOMAIN:-stockinsight.example.com}
EMAIL=${EMAIL:-admin@example.com}

docker run --rm -it \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email
