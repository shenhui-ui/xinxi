#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${1:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_NAME="wenxi-backup-${STAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

WAS_RUNNING=0
if docker compose ps --status running --services 2>/dev/null | grep -qx "wenxi"; then
  WAS_RUNNING=1
  echo "[backup] Stopping wenxi container to flush SQLite WAL cleanly..."
  docker compose stop wenxi >/dev/null
fi

restart_if_needed() {
  if [ "$WAS_RUNNING" -eq 1 ]; then
    echo "[backup] Restarting wenxi container..."
    docker compose start wenxi >/dev/null || true
  fi
}
trap restart_if_needed EXIT

echo "[backup] Archiving /data volume to ${ARCHIVE_PATH}..."
docker compose run --rm --no-deps --entrypoint "" \
  -v "${BACKUP_DIR}:/backups" \
  wenxi sh -c "rm -f /data/.instance.lock && tar czf /backups/${ARCHIVE_NAME} -C /data ."

if ! tar tzf "$ARCHIVE_PATH" | grep -Eq '^\./wenxi\.db$'; then
  echo "[backup] WARN: wenxi.db not found in archive (fresh instance?)"
fi

(
  cd "$BACKUP_DIR"
  sha256sum "$ARCHIVE_NAME" > "${ARCHIVE_NAME}.sha256"
)

echo "[backup] Done: ${ARCHIVE_PATH}"
echo "[backup] SHA256: $(cat "${ARCHIVE_PATH}.sha256")"
