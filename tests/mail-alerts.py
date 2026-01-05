import subprocess
import sys
import logging
import time
import requests

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
    
def verify_pricing_mail_sent(timeout=30):
    """
    Verifies that pricing approval mail was triggered.
    Uses MailHog / Mail API style endpoint.
    """
    logger.info("📧 Verifying Pricing Approval email...")

    # Adjust per env if needed
    MAIL_API_URL = "http://localhost:8025/api/v2/messages"
    EXPECTED_RECIPIENT = "winston.wang@cummins.com"
    EXPECTED_SUBJECT_KEYWORD = "China DBU Pricing App Alert"

    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            resp = requests.get(MAIL_API_URL, timeout=5)
            resp.raise_for_status()

            messages = resp.json().get("items", [])

            for msg in messages:
                subject = msg["Content"]["Headers"].get("Subject", [""])[0]
                recipients = [
                    f'{r["Mailbox"]}@{r["Domain"]}'
                    for r in msg.get("To", [])
                ]

                if (
                    EXPECTED_SUBJECT_KEYWORD in subject
                    and EXPECTED_RECIPIENT in recipients
                ):
                    logger.info("✅ Pricing Approval email verified successfully.")
                    return True

        except Exception as e:
            logger.warning(f"Mail check retrying... ({e})")

        time.sleep(3)

    logger.error("❌ Pricing Approval email NOT received within timeout.")
    return False


if run_scheduler_trigger():
    # Verify mail only if scheduler succeeded
    if verify_pricing_mail_sent():
        sys.exit(0)
    else:
        logger.error("❌ Scheduler ran but mail verification failed.")
        sys.exit(1)
else:
    sys.exit(1)
