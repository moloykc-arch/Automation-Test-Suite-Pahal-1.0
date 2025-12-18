#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ./scripts/run_with_ssh_tunnel.sh \
#   --ssh-host user@bastion.example.com \
#   --remote-db-host db.internal.example.com \
#   --remote-db-port 5432 \
#   --local-port 5472 \
#   --cmd "./.venv/bin/python3 db_test.py"

print_usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --ssh-host         SSH bastion host (eg. user@simw01)           [required]
  --remote-db-host   DB host as seen by bastion (eg. localhost)    [default: localhost]
  --remote-db-port   DB port on remote (eg. 5432)                 [default: 5432]
  --local-port       Local port to forward to (eg. 5472)         [default: 5472]
  --cmd              Command to run once tunnel is up (quoted)   [default: ./.venv/bin/python3 db_test.py]
  --keep-tunnel      Leave tunnel running after command exits (flag)
  -h|--help          Show this message and exit

Description:
  This script creates an SSH local port forward (background), runs the provided
  command in the current terminal (using the forwarded local port), then
  cleans up the SSH tunnel unless --keep-tunnel is specified.

Example:
  ./scripts/run_with_ssh_tunnel.sh --ssh-host simw01 --remote-db-host localhost \
    --cmd "./.venv/bin/python3 db_test.py"

EOF
}

SSH_HOST=""
REMOTE_DB_HOST="localhost"
REMOTE_DB_PORT=5432
LOCAL_PORT=5472
CMD="./.venv/bin/python3 db_test.py"
KEEP_TUNNEL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-host) SSH_HOST="$2"; shift 2;;
    --remote-db-host) REMOTE_DB_HOST="$2"; shift 2;;
    --remote-db-port) REMOTE_DB_PORT="$2"; shift 2;;
    --local-port) LOCAL_PORT="$2"; shift 2;;
    --cmd) CMD="$2"; shift 2;;
    --keep-tunnel) KEEP_TUNNEL=1; shift 1;;
    -h|--help) print_usage; exit 0;;
    *) echo "Unknown argument: $1"; print_usage; exit 1;;
  esac
done

if [[ -z "$SSH_HOST" ]]; then
  echo "Error: --ssh-host is required"
  print_usage
  exit 1
fi

set -x

# Test if local port is free
if ss -tuln | egrep -q "(:|\b)${LOCAL_PORT}\b"; then
  echo "Local port ${LOCAL_PORT} is already in use. See which process and aborting." >&2
  ss -tulpen | egrep "(:|\b)${LOCAL_PORT}\b" || true
  exit 2
fi

# Start an SSH local forward in background (-f -N)
# The local side listens on LOCAL_PORT and forwards to REMOTE_DB_HOST:REMOTE_DB_PORT
SSH_CMD=(ssh -o ExitOnForwardFailure=yes -L "${LOCAL_PORT}:${REMOTE_DB_HOST}:${REMOTE_DB_PORT}" "${SSH_HOST}" -N -f)

echo "Starting SSH tunnel: ${SSH_CMD[*]}"
"${SSH_CMD[@]}"

SSH_PID=""
# Try to discover the background ssh process PID for the forward
for i in {1..6}; do
  sleep 0.5
  SSH_PID=$(pgrep -f "ssh.*:${LOCAL_PORT}:${REMOTE_DB_PORT}" | head -n1 || true)
  if [[ -n "$SSH_PID" ]]; then break; fi
done

if [[ -n "$SSH_PID" ]]; then
  echo "Tunnel established (ssh pid=$SSH_PID), local:${LOCAL_PORT} -> ${REMOTE_DB_HOST}:${REMOTE_DB_PORT}"
else
  echo "Warning: could not detect ssh PID for the tunnel. Proceeding anyway." >&2
fi

echo "Waiting for local port ${LOCAL_PORT} to become ready..."
for i in {1..20}; do
  if ss -tuln | egrep -q "(:|\b)${LOCAL_PORT}\b"; then
    echo "Port ${LOCAL_PORT} is listening locally"
    break
  fi
  sleep 0.25
done

echo "Running: $CMD"
bash -lc "$CMD"

EXIT_CODE=$?

if [[ $KEEP_TUNNEL -eq 1 ]]; then
  echo "Leaving tunnel running after command exit (pid=$SSH_PID)."
  exit $EXIT_CODE
fi

if [[ -n "$SSH_PID" ]]; then
  echo "Cleaning up tunnel (killing pid $SSH_PID)..."
  kill "$SSH_PID" || true
  sleep 0.2
  echo "Tunnel cleaned up."
else
  echo "No tunnel PID found; nothing to clean up."
fi

exit $EXIT_CODE
