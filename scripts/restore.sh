#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-archive.tar.gz> [--yes]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_INPUT="$1"
AUTO_YES="${2:-}"

if [ ! -f "$ARCHIVE_INPUT" ]; then
  echo "[restore] ERROR: Archive not found: $ARCHIVE_INPUT"
  exit 1
fi

ARCHIVE_ABS="$(cd "$(dirname "$ARCHIVE_INPUT")" && pwd)/$(basename "$ARCHIVE_INPUT")"
ARCHIVE_DIR="$(dirname "$ARCHIVE_ABS")"
ARCHIVE_FILE="$(basename "$ARCHIVE_ABS")"

if [ -f "${ARCHIVE_ABS}.sha256" ]; then
  echo "[restore] Verifying SHA256 checksum..."
  (cd "$ARCHIVE_DIR" && sha256sum -c "${ARCHIVE_FILE}.sha256")
fi

if [ "$AUTO_YES" != "--yes" ]; then
  read -r -p "[restore] This will overwrite /data in wenxi_data volume. Continue? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "[restore] Aborted."; exit 0 ;;
  esac
fi

cd "$ROOT_DIR"

echo "[restore] Stopping wenxi container..."
docker compose stop wenxi >/dev/null || true

echo "[restore] Restoring archive into /data volume..."
docker compose run --rm --no-deps --entrypoint "" \
  -v "${ARCHIVE_DIR}:/backups:ro" \
  wenxi sh -c "find /data -mindepth 1 -delete && tar xzf /backups/${ARCHIVE_FILE} -C /data && rm -f /data/.instance.lock"

echo "[restore] Starting wenxi container..."
docker compose start wenxi >/dev/null

echo "[restore] Restore complete."
