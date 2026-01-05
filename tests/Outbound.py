import subprocess
import time
import psycopg2
import sys
import socket
import requests 
import os
import signal
import logging
import json

# ==========================================
# LOGGING CONFIGURATION
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# IMPORT CENTRAL CONFIG
try:
    from env_config import CURRENT_CONFIG, LOCAL_DB_PORT, TEST_ENV_NAME
    logger.info("✅ Imported config from env_config")
except ImportError:
    logger.warning("⚠️ Could not import env_config. Using default fallback values.")
    ENV_MAP = {}
    LOCAL_DB_PORT = 6001
    TEST_ENV_NAME = "DEV"
    CURRENT_CONFIG = {
        "SSH_HOST": "simw01",
        "REMOTE_DB_PORT": 5432,
        "DB_NAME": "china_dbu_dev",
        "DB_USER": "china_app",
        "DB_PASS": "admin@china_app"
    }

# ==========================================
# CONFIGURATION
# ==========================================
# 1. DB Tunnel Host (Always simw01 for DEV per user request)
# If QA, it uses the config value (qa-spriced)
DB_SSH_HOST = "simw01" if TEST_ENV_NAME == "DEV" else CURRENT_CONFIG.get("SSH_HOST", "qa-spriced")

# 2. Curl Command Host (dev-spriced for DEV per user request)
if TEST_ENV_NAME == "DEV":
    CURL_SSH_HOST = "dev-spriced"
elif TEST_ENV_NAME == "QA":
    CURL_SSH_HOST = "qa-spriced"
else:
    raise ValueError(f"❌ Unsupported TEST_ENV_NAME: {TEST_ENV_NAME}")


REMOTE_DB_PORT = int(CURRENT_CONFIG.get("REMOTE_DB_PORT", 5432))
BACKEND_PORT = 8880  

DB_CONFIG = {
    "dbname": CURRENT_CONFIG.get("DB_NAME", "china_dbu_dev"),
    "user": CURRENT_CONFIG.get("DB_USER", "china_app"),
    "password": CURRENT_CONFIG.get("DB_PASS", "admin@china_app"),
    "host": "127.0.0.1",
    "port": LOCAL_DB_PORT
}

logger.info(f"🔹 DB SSH Host: {DB_SSH_HOST}")
logger.info(f"🔹 Curl SSH Host: {CURL_SSH_HOST}")
logger.info(f"🔹 DB Config: {DB_CONFIG['dbname']} on port {LOCAL_DB_PORT}")

def kill_process_on_port(port):
    """Finds and kills any process listening on the specified local port."""
    logger.info(f"🔍 Checking for processes on port {port}...")
    try:
        # Check for process using the port (Linux/Mac)
        cmd = f"lsof -ti:{port}"
        pid = subprocess.check_output(cmd, shell=True).decode().strip()
        if pid:
            logger.warning(f"⚠️ Port {port} is in use by PID {pid}. Killing it...")
            os.kill(int(pid), signal.SIGKILL)
            time.sleep(1) # Wait for release
            logger.info(f"✅ Port {port} freed.")
        else:
            logger.info(f"✅ Port {port} is free.")
    except subprocess.CalledProcessError:
        logger.info(f"✅ Port {port} is free (no process found).")
    except Exception as e:
        logger.error(f"⚠️ Could not kill process on port {port}: {e}")

def wait_for_port(port, timeout=10):
    """Waits for a port to be open on localhost."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            result = sock.connect_ex(('127.0.0.1', port))
            if result == 0:
                return True
        time.sleep(0.5)
    return False

def start_ssh_tunnel():
    logger.info(f"🚀 Launching SSH Tunnel to '{DB_SSH_HOST}' for Database Connection...")
    
    # 1. Ensure Port 6001 is free
    kill_process_on_port(LOCAL_DB_PORT)
    
    # 2. Start Tunnel
    # Only forwarding the DB port here via simw01 (for DEV)
    # Removing -N so we can see output if it fails immediately, but typically -N is correct for forwarding
    ssh_cmd = [
        "ssh", "-v", "-N", 
        "-L", f"{LOCAL_DB_PORT}:127.0.0.1:{REMOTE_DB_PORT}", 
        DB_SSH_HOST
    ]
    logger.info(f"▶ Executing SSH Command: {' '.join(ssh_cmd)}")
    
    # Windows fix
    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        tunnel_process = subprocess.Popen(ssh_cmd, creationflags=creationflags, stderr=subprocess.PIPE)
        logger.info("⏳ Waiting 5 seconds for SSH tunnel to establish...")
        
        # Verify the port actually opened
        if wait_for_port(LOCAL_DB_PORT):
             logger.info(f"✅ SSH Tunnel established. Port {LOCAL_DB_PORT} is open.")
        else:
             logger.error(f"❌ SSH Tunnel failed to bind port {LOCAL_DB_PORT}. Check SSH logs.")
             if tunnel_process.poll() is not None:
                 _, stderr = tunnel_process.communicate()
                 logger.error(f"SSH Error Output: {stderr.decode()}")
             return None

        return tunnel_process
    except Exception as e:
        logger.error(f"❌ Failed to start SSH tunnel process: {e}")
        return None


def database_flow():
    conn = None
    cursor = None
    try:
        logger.info(f"🚀 Connecting to DB on local port {LOCAL_DB_PORT}...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        logger.info(f"✅ Connected to database {DB_CONFIG['dbname']}")

        select_query = """
        SELECT *
        FROM china.list_pricing
        WHERE region = 'CHINA'
          AND publish_local_currency_list_price IS NOT NULL
          AND publish_local_currency_lp_effective_date IS NOT NULL
          AND published_to_goms_date IS NOT NULL
          AND outbound_staged_date IS NULL
        LIMIT 10;
        """

        logger.info("🔄 Executing SELECT query...")
        cursor.execute(select_query)
        rows = cursor.fetchall()

        if rows and len(rows) > 0:
            logger.info(f"🎉 Data found! Total rows: {len(rows)}")
        else:
            logger.warning("⚠️ No matching data found (checking logic only).")
            update_query = """
            WITH cte AS (
                SELECT *
                FROM list_pricing
                WHERE region = 'CHINA'
                LIMIT 10
            )
            UPDATE list_pricing
            SET publish_local_currency_list_price = 234,
                publish_local_currency_lp_effective_date = DATE '2025-06-06',
                published_to_goms_date = DATE '2025-06-06',
                outbound_staged_date = NULL
            FROM cte
            WHERE list_pricing.id = cte.id;
            """

            cursor.execute(update_query)
            conn.commit()
            print("🎉 Update executed! Verifying...")

            cursor.execute(select_query)
            verify_rows = cursor.fetchall()
            print(f"✨ Verified — rows count now: {len(verify_rows)}")
            
    except Exception as e:
        logger.error(f"❌ Database Error: {e}")

    finally:
        if cursor: cursor.close()
        if conn: conn.close()
        logger.info("🔒 Closed DB connection")


# ==========================================
# BACKEND WORKFLOW TRIGGER (REMOTE CURL)
# ==========================================
# def run_backend_workflow():
#     # Logic Update: Run curl on the remote host (CURL_SSH_HOST)
#     logger.info(f"🚀 Triggering backend workflow on '{CURL_SSH_HOST}' via SSH...")

#     # The actual curl command to run remotely
#     # Note: Using localhost:8880 because inside the remote server (dev-spriced), the service is running on 8880
#     remote_curl_cmd = """curl --location --request POST http://localhost:8880/platform/api/v1/tml \
#   --header "Content-Type: application/json" \
#   --data-raw '{
#     "stateVariable": {
#       "workflowId": "2371",
#       "transactionStateStore": {},
#       "lastSuccessfulTransaction": null,
#       "firstSuccessfulTransaction": null,
#       "lastTransaction": null,
#       "allSuccessfulTransactions": [],
#       "allFailedTransactions": []
#     },
#     "requestData": { "4": "four" },
#     "entity": "outbound",
#     "batchId": "aaditya",
#     "workflowId": "bhardwaa",
#     "microservices": [],
#     "endpoints": {
#       "outbound": [
#         { "version": "1.0", "functionName": "CustomChinaOutboundService" }
#       ]
#     },
#     "communicationType": "rest",
#     "version": "1.0"
#   }'
# """


#     # Construct SSH command: ssh dev-spriced "curl ..."
#     ssh_cmd = [
#     "ssh",
#     "-o", "ExitOnForwardFailure=yes",
#     "-o", "ControlMaster=no",
#     "-o", "ControlPath=none",
#     CURL_SSH_HOST,
#     "bash", "-lc", remote_curl_cmd
# ]
#     print(ssh_cmd)

#     # try:
#     #     logger.info(f"▶ Executing: {' '.join(ssh_cmd)}")
#     #     result = subprocess.run(ssh_cmd, capture_output=True, text=True)
        
#     #     output = result.stdout.strip()
#     #     logger.info(f"SSH Exit Code: {result.returncode}")
        
#     #     # Check success (curl output usually contains the response body)
#     #     if result.returncode == 0:
#     #         logger.info("🎉 Backend workflow triggered successfully.")
#     #         # logger.info(f"Response: {output}")
#     #         return True
#     #     else:
#     #         logger.error(f"❌ Remote execution failed.")
#     #         logger.error(f"   STDOUT: {output}")
#     #         if result.stderr:
#     #             logger.error(f"   STDERR: {result.stderr}")
#     #         return False
            
#     # except Exception as e:
#     #     logger.error(f"❌ Error triggering backend: {e}")
#     #     return False
#     result = subprocess.run(
#     ssh_cmd,
#     capture_output=True,
#     text=True
# )

# # 1️⃣ SSH-level failure
#     if result.returncode != 0:
#         logger.error("❌ SSH command failed")
#         logger.error(result.stderr)
#         return False

#     stdout = result.stdout.strip()
#     logger.info(f"Remote curl output: {stdout}")

#     # 2️⃣ Curl-level failure (no HTTP status printed)
#     if not stdout.startswith("HTTP_STATUS:"):
#         logger.error("❌ Curl did not return HTTP status")
#         return False

#     # 3️⃣ HTTP-level validation
#     http_code = int(stdout.split(":")[1])

#     if http_code != 200:
#         logger.error(f"❌ Backend returned HTTP {http_code}")
#         return False

#     logger.info("✅ Backend workflow triggered successfully (HTTP 200)")
#     return True

def run_backend_workflow():
    logger.info(f"🚀 Triggering backend workflow on '{CURL_SSH_HOST}' via SSH...")

    payload = r'''
                {
                "stateVariable": {
                    "workflowId": "2371",
                    "transactionStateStore": {},
                    "lastSuccessfulTransaction": null,
                    "firstSuccessfulTransaction": null,
                    "lastTransaction": null,
                    "allSuccessfulTransactions": [],
                    "allFailedTransactions": []
                },
                "requestData": { "4": "four" },
                "entity": "outbound",
                "batchId": "aaditya",
                "workflowId": "bhardwaa",
                "microservices": [],
                "endpoints": {
                    "outbound": [
                    { "version": "1.0", "functionName": "CustomChinaOutboundService" }
                    ]
                },
                "communicationType": "rest",
                "version": "1.0"
                }
                '''
    
    remote_cmd = f"""
    set -e

    tmpfile=$(mktemp /tmp/outbound_payload.XXXX.json)

    cat <<'EOF' > "$tmpfile"
    {payload}
    EOF

    attempts=5
    sleep_seconds=2
    response=""
    success=0

    for i in $(seq 1 $attempts); do
    response=$(curl -s \
        -w "\\nHTTP_STATUS:%{{http_code}}\\n" \
        --location \
        --request POST http://localhost:8880/platform/api/v1/tml \
        --header "Content-Type: application/json" \
        --data @"$tmpfile")

    if echo "$response" | grep -q "HTTP_STATUS:"; then
        echo "$response"
        success=1
        break
    fi

    sleep $sleep_seconds
    done

    rm -f "$tmpfile"

    if [ "$success" -ne 1 ]; then
    echo "ERROR: curl did not return HTTP status after retries"
    exit 1
    fi
    """

    
    ssh_cmd = [
        "ssh",
        "-o", "ControlMaster=no",
        "-o", "ControlPath=none",
        "-o", "ControlPersist=no",
        "-o", "ClearAllForwardings=yes",
        "-o", "ExitOnForwardFailure=yes",
        CURL_SSH_HOST,
        "bash", "-lc", remote_cmd
    ]


    result = subprocess.run(ssh_cmd, capture_output=True, text=True)

    stdout = result.stdout.strip()
    logger.info(f"Remote output:\n{stdout}")

    # Split response body and HTTP status
    try:
        body, status_line = stdout.rsplit("\n", 1)
    except ValueError:
        logger.error("❌ Unexpected curl output format")
        return False

    if not status_line.startswith("HTTP_STATUS:"):
        logger.error("❌ Missing HTTP status from curl")
        return False

    http_code = int(status_line.split(":")[1])

    if http_code < 200 or http_code >= 300:
        logger.error(f"❌ HTTP failure: {http_code}")
        return False

    # Parse JSON body
    try:
        response_json = json.loads(body)
    except json.JSONDecodeError as e:
        logger.error(f"❌ Invalid JSON response: {e}")
        return False
    response_list = response_json.get("responseList")

    if not response_list or not isinstance(response_list, list):
        logger.error("❌ responseList missing or empty")
        return False

    first_response = response_list[0]

    if first_response.get("error") is not None:
        logger.error(f"❌ Backend returned error: {first_response['error']}")
        return False

    business_id = first_response.get("businessId")
    step_id = first_response.get("businessStepId")

    if not business_id or not step_id:
        logger.error("❌ businessId or businessStepId missing")
        return False

    logger.info("✅ Backend workflow triggered successfully")
    logger.info(f"📌 Business ID: {business_id}")
    logger.info(f"📌 Step ID: {step_id}")

    return True


def run_playwright_test():
    logger.info("🧭 Launching Playwright UI validation...")
    
    command = "npx playwright test verify_outbound_date.spec.js --headed"
    logger.info(f"▶ Executing: {command}")
    
    try:
        subprocess.run(command, shell=True, check=True)
        logger.info("✅ Playwright test completed successfully.")
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Playwright test failed")
        sys.exit(e.returncode)

# ==========================================
# MAIN
# ==========================================
if __name__ == "__main__":
    # Force UTF-8 output
    sys.stdout.reconfigure(encoding='utf-8')
    logger.info("🏁 Starting Outbound Script...")

    tunnel = start_ssh_tunnel()
    backend_success = False

    try:
        # 1. Check DB (uses DB_SSH_HOST / simw01)
        if tunnel:
            database_flow()
            
            # 2. Trigger Workflow (uses CURL_SSH_HOST / dev-spriced)
            # This is independent of the local DB tunnel
            backend_success = run_backend_workflow()
        else:
            logger.error("🛑 Skipping steps due to Tunnel failure.")
            sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Unexpected error in main flow: {e}")
    finally:
        if tunnel:
            logger.info("🛑 Shutting down SSH tunnel...")
            tunnel.terminate()
            try:
                tunnel.wait(timeout=2)
            except subprocess.TimeoutExpired:
                tunnel.kill()
            logger.info("🔒 SSH tunnel closed")

    # Only run Playwright if backend trigger was successful
    if backend_success:
        run_playwright_test()
    else:
        logger.info("⏭️ Skipping Playwright test due to previous failures.")
        sys.exit(1)