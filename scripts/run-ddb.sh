#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/jetson-iot/command_listener.env"
HEARTBEAT_FILE="backend/data/ddb_heartbeat.json"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
      *=*)
        key="${line%%=*}"
        value="${line#*=}"
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:-1}"
        fi
        printf -v "$key" '%s' "$value"
        export "$key"
        ;;
    esac
  done < "$ENV_FILE"
fi

if [ -f "$HEARTBEAT_FILE" ]; then
  sudo chown "$(id -u):$(id -g)" "$HEARTBEAT_FILE" >/dev/null 2>&1 || true
fi

exec npm run serve -- --ddb
