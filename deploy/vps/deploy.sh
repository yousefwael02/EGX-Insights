#!/usr/bin/env sh
set -eu

export IMAGE_TAG=${IMAGE_TAG:-latest}
export GITHUB_OWNER=${GITHUB_OWNER:-your-org-or-user}

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
