import subprocess
import sys
import logging

# IMPORT CENTRAL CONFIG
try:
    from env_config import CURRENT_CONFIG, TEST_ENV_NAME
except ImportError:
    # Fallback
    CURRENT_CONFIG = {}
    TEST_ENV_NAME = "DEV"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_scheduler_trigger():
    # 2. Define the Remote Command
    # The command to run on the remote server
    # We use -w "%{http_code}" to print the status code at the end
    curl_cmd = 'curl -s -o /dev/null -w "%{http_code}" --location "http://localhost:8085/scheduler/approval2/start"'
    
    if TEST_ENV_NAME == "QA":
        # QA Flow
        ssh_host = "qa-spriced"
        local_cmd = ["ssh", ssh_host, curl_cmd]
        logger.info(f"🚀 Triggering Scheduler on '{ssh_host}' (Direct Command)...")
        
    else:
        # DEV Flow - UPDATED per user instruction
        # User confirmed they can run "ssh dev-spriced" then curl directly.
        ssh_host = "dev-spriced"
        local_cmd = ["ssh", ssh_host, curl_cmd]
        logger.info(f"🚀 Triggering Scheduler on '{ssh_host}' (Direct Command)...")

    try:
        logger.info(f"▶ Executing: {' '.join(local_cmd)}")
        
        # Capture output
        result = subprocess.run(local_cmd, capture_output=True, text=True)
        
        output = result.stdout.strip()
        logger.info(f"SSH Exit Code: {result.returncode}")
        
        # Check success
        if result.returncode == 0:
             # Check if the output contains the status code 200
            if "200" in output.splitlines()[-1]:
                logger.info("🎉 Scheduler triggered successfully. Status Code: 200")
                return True
            else:
                logger.error(f"❌ Scheduler failed. Expected HTTP 200, got: {output}")
                logger.info(f"Full Output: {output}")
                if result.stderr:
                    logger.error(f"STDERR: {result.stderr}")
                return False
        else:
            logger.error("❌ Scheduler failed (SSH Error).")
            logger.error(f"   Output: {output}")
            if result.stderr:
                logger.error(f"   STDERR: {result.stderr}")
            return False

    except Exception as e:
        logger.exception(f"❌ Error executing remote trigger: {e}")
        return False

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    logger.info("Starting Alert Trigger Script...")
    
    if run_scheduler_trigger():
        sys.exit(0)
    else:
        sys.exit(1)