import signal
import socket
import sys
from .env_config import CURRENT_CONFIG, LOCAL_DB_PORT, TEST_ENV_NAME
from fastapi import FastAPI
from pydantic import BaseModel
import os
import time
import pandas as pd
import psycopg2
import paramiko
import subprocess
# IMPORT CENTRAL CONFIG
try:
    from env_config import CURRENT_CONFIG, LOCAL_DB_PORT, TEST_ENV_NAME
except ImportError:
    # Fallback default
    TEST_ENV_NAME = "QA"
    LOCAL_DB_PORT = 6001
    CURRENT_CONFIG = {
        "SSH_HOST": "simw01",
        "DB_NAME": "qa_spriced",
        "DB_USER": "china_app",
        "DB_PASS": "admin_china_app",
        "REMOTE_DB_PORT": 5432
    }
# =====================================
# CONFIGURATION
# =====================================
# Use Linux paths for your source file
LOCAL_CSV_PATH = "/home/malay/Downloads/nrp_msbi_chn_sales_202510141003.csv (3).pgp"
CSV_FILE = "/home/malay/Downloads/10_record (1).csv" 
REMOTE_HOST = "106.51.91.59" # Hostname of the destination (e.g., Inbound site)
REMOTE_USER = "cfg"
# REMOTE_PASS = "your_password"
REMOTE_DIR = "/Inbox/sales/" # Update this to the real remote path

# =====================================
# FASTAPI APP
# =====================================
app = FastAPI(title="Inbound Sales File")

class AutomationRequest(BaseModel):
    environment: str
    flow: str

# =====================================
# HELPER: SFTP Transfer (Replaces WinSCP)
# =====================================
def run_sftp_transfer():
    print("🔹 Step 1: Starting SFTP Transfer...")
    
    if not os.path.exists(LOCAL_CSV_PATH):
        print(f"❌ Error: Local file not found at {LOCAL_CSV_PATH}")
        return False

    try:
        # Create SSH Client
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # --- UPDATED CONNECTION BLOCK ---
        ssh.connect(
            REMOTE_HOST, 
            username=REMOTE_USER, 
            key_filename="/home/malay/.ssh/id_rsa" # <--- Ensure this filename matches your actual key
        )
        # --------------------------------
        
        # Open SFTP
        sftp = ssh.open_sftp()
        filename = os.path.basename(LOCAL_CSV_PATH)
        remote_path = os.path.join(REMOTE_DIR, filename)
        
        print(f"🔹 Uploading {filename} to {remote_path}...")
        sftp.put(LOCAL_CSV_PATH, remote_path)
        
        sftp.close()
        ssh.close()
        print("✅ File transferred successfully via SFTP!")
        return True
    except Exception as e:
        print(f"❌ SFTP Failed: {e}")
        return False

# =====================================
# HELPER: Backend Workflow (System SSH)
# =====================================

def run_backend_workflow(env):
    print(f"\n🚀 Starting backend workflow for {env}...")

    # 1. Determine Host based on Environment
    if env == "qa":
        ssh_host = "qa-spriced"
    else:
        # Default to dev-spriced for 'dev' or any other string
        ssh_host = "dev-spriced"

    # 2. Define the Remote Command
    # We use the original Sales Workflow URL
    target_url = "http://localhost:5087/workflow/runWorkflow/Sales%20Workflow"
    
    # curl flags:
    # -s: Silent (don't show progress bar)
    # -o /dev/null: Hide the response body (we only care if it worked)
    # -w "%{http_code}": Print ONLY the status code (e.g., 200)
    curl_cmd = f'curl -X POST -s -o /dev/null -w "%{{http_code}}" "{target_url}"'

    # 3. Construct Command
    # We simply use "ssh <host> <command>" and let the OS handle the keys
    local_cmd = ["ssh", ssh_host, curl_cmd]
    
    print(f"▶ Executing: {' '.join(local_cmd)}")

    try:
        # Capture output
        result = subprocess.run(local_cmd, capture_output=True, text=True)
        
        output = result.stdout.strip()
        print(f"SSH Exit Code: {result.returncode}")

        # 4. Check Success
        if result.returncode == 0:
            # Check if the output contains the status code 200
            if "200" in output:
                print(f"🎉 Backend workflow triggered successfully. Status Code: 200")
                return True
            else:
                print(f"❌ Workflow failed. Expected HTTP 200, got: {output}")
                return False
        else:
            print("❌ Workflow failed (SSH Error).")
            print(f"   Output: {output}")
            if result.stderr:
                print(f"   STDERR: {result.stderr}")
            return False

    except Exception as e:
        print(f"❌ Error executing remote trigger: {e}")
        return False    


# =====================================
# HELPER: Validation (With Auto-Tunnel)
# =====================================
def kill_process_on_port(port):
    """Finds and kills any process listening on the specified local port."""
    print(f"🔍 Checking for processes on port {port}...")
    try:
        # Check for process using the port (Linux/Mac)
        cmd = f"lsof -ti:{port}"
        pid = subprocess.check_output(cmd, shell=True).decode().strip()
        if pid:
            print(f"⚠️ Port {port} is in use by PID {pid}. Killing it...")
            os.kill(int(pid), signal.SIGKILL)
            time.sleep(1) # Wait for release
            print(f"✅ Port {port} freed.")
    except subprocess.CalledProcessError:
        print(f"✅ Port {port} is free (no process found).")
    except Exception as e:
        print(f"⚠️ Could not kill process on port {port}: {e}")

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
    # Logic: Always simw01 for DEV, otherwise use config host (QA)
    db_ssh_host = "simw01" if TEST_ENV_NAME == "DEV" else CURRENT_CONFIG.get("SSH_HOST", "qa-spriced")
    remote_db_port = CURRENT_CONFIG.get("REMOTE_DB_PORT", 5432)

    print(f"🚀 Launching SSH Tunnel to '{db_ssh_host}'...")
    
    # 1. Ensure Port is free
    kill_process_on_port(LOCAL_DB_PORT)
    
    # 2. Start Tunnel
    # Mapping: Local 6001 -> Remote 127.0.0.1:5432 (Relative to the SSH Host)
    ssh_cmd = [
        "ssh", "-N", 
        "-L", f"{LOCAL_DB_PORT}:127.0.0.1:{remote_db_port}", 
        db_ssh_host
    ]
    
    # Windows compatibility fix
    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        tunnel_process = subprocess.Popen(ssh_cmd, creationflags=creationflags)
        print("⏳ Waiting for SSH tunnel to establish...")
        
        # 3. Verify the port actually opened
        if wait_for_port(LOCAL_DB_PORT):
             print(f"✅ SSH Tunnel established. Port {LOCAL_DB_PORT} is ready.")
             return tunnel_process
        else:
             print(f"❌ SSH Tunnel failed to bind port {LOCAL_DB_PORT}.")
             tunnel_process.terminate()
             return None
    except Exception as e:
        print(f"❌ Failed to start SSH tunnel process: {e}")
        return None

# =====================================
# MAIN VALIDATION FUNCTION
# =====================================
def validate_csv_vs_db():
    print("\n🚀 Starting CSV vs DB validation...")
    
    TARGET_COUNTRY = "HONG KONG"
    TARGET_PART_NUMBER = "0100-3399-04"
    FULL_CODE = f"{TARGET_COUNTRY}-{TARGET_PART_NUMBER}"
    
    # Initialize these outside try/except so 'finally' works safely
    tunnel = None
    conn = None

    try:
        # --- 1. CSV CHECK ---
        # Ensure 'LOCAL_CSV_PATH' matches the variable name at the top of your script
        df = pd.read_csv(CSV_FILE, sep='|')
        
        target_row = df[
            (df["part_number"].astype(str).str.strip() == TARGET_PART_NUMBER)
            & (df["country"].astype(str).str.strip().str.upper() == TARGET_COUNTRY)
        ]

        if target_row.empty:
            print(f"❌ No matching record found in CSV for {FULL_CODE}")
            return {"status": "fail", "reason": "CSV record not found"}

        csv_volume = str(target_row.iloc[0]["annual_volume"]).strip()
        print(f"📄 CSV Volume: {csv_volume}")

        # --- 2. START TUNNEL ---
        tunnel = start_ssh_tunnel()
        if not tunnel:
            return {"status": "fail", "error": "Could not establish SSH tunnel"}

        # --- 3. CONNECT TO DB ---
        print(f"📊 Connecting to DB on localhost:{LOCAL_DB_PORT}...")
        conn = psycopg2.connect(
            host="127.0.0.1",
            port=LOCAL_DB_PORT,
            database=CURRENT_CONFIG["DB_NAME"],
            user=CURRENT_CONFIG["DB_USER"],
            password=CURRENT_CONFIG["DB_PASS"]
        )
        
        # --- 4. RUN QUERY ---
        cur = conn.cursor()
        # Ensure schema.table name is correct
        cur.execute("SELECT annual_volume FROM china.list_pricing WHERE code=%s;", (FULL_CODE,)) 
        db_result = cur.fetchone() # Fixed: Variable name match
        
        if not db_result:
            print("❌ DB record not found.")
            return {"status": "fail", "reason": "DB record not found"}

        db_volume = str(db_result[0]).strip()
        print(f"🗄️ DB Volume: {db_volume}")

        # --- 5. COMPARE ---
        if csv_volume == db_volume:
            print("✅ PASS: Volumes match.")
            return {"status": "pass", "volume": csv_volume}
        else:
            print(f"❌ FAIL: Mismatch. CSV={csv_volume}, DB={db_volume}")
            return {"status": "fail", "csv_volume": csv_volume, "db_volume": db_volume}

    except Exception as e:
        print(f"❌ DB Validation Failed: {e}")
        return {"status": "fail", "error": str(e)}

    finally:
        # --- 6. CLEANUP ---
        if conn:
            conn.close()
        if tunnel:
            print("🔌 Closing SSH Tunnel...")
            tunnel.terminate()
# =====================================
# API ENDPOINT
# =====================================
@app.post("/run-automation")
def run_automation(request: AutomationRequest):
    env = request.environment.lower()
    flow = request.flow.lower()

    print(f"📦 Received request → environment={env}, flow={flow}")

    if flow == "a":
        # 1. Run Transfer
        if not run_sftp_transfer():
            return {"error": "SFTP Transfer failed"}
            
        # 2. Run Backend
        if not run_backend_workflow(env):
            return {"error": "Backend workflow failed"}
            
        # 3. Validate
        result = validate_csv_vs_db()
        return {"flow": flow, "environment": env, "result": result}

    elif flow == "b":
        return {"flow": flow, "status": "success (flow b placeholder)"}

    else:
        return {"error": f"Unknown flow '{flow}'"}