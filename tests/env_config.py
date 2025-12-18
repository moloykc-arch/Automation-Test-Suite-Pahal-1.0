import os

# 1. Get the Environment Name
TEST_ENV_NAME = os.getenv("TEST_ENV_NAME", "DEV").upper()

print(f"🌍 LOADING CONFIG FOR ENVIRONMENT: {TEST_ENV_NAME}")

# 2. Define Infrastructure Details
ENV_MAP = {
    "DEV": {
        "SSH_HOST": "simw01",
        "SSH_USER": None,
        "SSH_VM_PATH": "dev-spriced",
        "DB_NAME": "dev_spriced",
        "DB_USER": "china_app",
        "DB_PASS": "admin_china_app",
        "REMOTE_DB_PORT": 5432,
        "UI_URL": "https://dev-spriced-cdbu.alpha.simadvisory.com/",
        "AUTH_BASE_URL": "https://auth.alpha.simadvisory.com",
        "AUTH_REALM": "D_SPRICED",
        "AUTH_CLIENT_ID": "CHN_D_SPRICED_Client"
    },
    "QA": {
        "SSH_HOST": "simw01",
        "SSH_USER": None,
        "SSH_VM_PATH": "projects/spriced-pipeline/vms/qa-spriced",
        "DB_NAME": "qa_spriced",
        "DB_USER": "china_app",
        "DB_PASS": "admin_china_app",
        "REMOTE_DB_PORT": 5432,
        "UI_URL": "https://qa-spriced-cdbu.alpha.simadvisory.com/",
        "AUTH_BASE_URL": "https://auth.alpha.simadvisory.com", 
        "AUTH_REALM": "D_SPRICED",
        "AUTH_CLIENT_ID": "CHN_D_SPRICED_Client"
    }
}

# 3. Select Current Config
CURRENT_CONFIG = ENV_MAP.get(TEST_ENV_NAME, ENV_MAP["DEV"])

# Common Constants
LOCAL_DB_PORT = 6001