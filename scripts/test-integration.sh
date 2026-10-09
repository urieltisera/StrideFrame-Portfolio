#!/usr/bin/env bash
set -euo pipefail

TEST_DB_NAME="sportpix_test_migrated"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://sportpix:sportpix@localhost:5432/${TEST_DB_NAME}?schema=public}"

if command -v docker >/dev/null 2>&1 && docker compose ps -q db >/dev/null 2>&1; then
  docker compose exec -T db psql -U sportpix -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'" | grep -q 1 || docker compose exec -T db psql -U sportpix -d postgres -c "CREATE DATABASE ${TEST_DB_NAME};"
fi

DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" TEST_DATABASE_URL="$TEST_DATABASE_URL" vitest run tests/integration
