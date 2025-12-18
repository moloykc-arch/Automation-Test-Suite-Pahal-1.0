import psycopg2
import subprocess
import os
import sys
import time
import socket
import urllib.parse

# IMPORT CENTRAL CONFIG
try:
    from env_config import CURRENT_CONFIG, LOCAL_DB_PORT
except ImportError:
    # Basic fallback if config is missing (useful for standalone debug)
    CURRENT_CONFIG = {
        "SSH_HOST": "simw01",
        "REMOTE_DB_PORT": 5432,
        "DB_NAME": "china_dbu_dev",
        "DB_USER": "china_app",
        "DB_PASS": "admin@china_app",
        "UI_URL": "https://dev-spriced-cdbu.alpha.simadvisory.com/",
        "AUTH_BASE_URL": "https://auth.alpha.simadvisory.com",
        "AUTH_REALM": "D_SPRICED",
        "AUTH_CLIENT_ID": "CHN_D_SPRICED_Client"
    }
    LOCAL_DB_PORT = 6001

# ==========================================
# CONFIGURATION
# ==========================================
SSH_HOST = CURRENT_CONFIG.get("SSH_HOST", "simw01")
REMOTE_DB_PORT = int(CURRENT_CONFIG.get("REMOTE_DB_PORT", 5432))

DB_CONFIG = {
    "dbname": CURRENT_CONFIG.get("DB_NAME", "china_dbu_dev"),
    "user": CURRENT_CONFIG.get("DB_USER", "china_app"),
    "password": CURRENT_CONFIG.get("DB_PASS", "admin@china_app"),
    "host": "127.0.0.1",
    "port": LOCAL_DB_PORT
}

# ==========================================
# SSH TUNNEL FUNCTIONS
# ==========================================
def start_ssh_tunnel():
    """Starts a local SSH tunnel process."""
    print(f"\n🚀 Launching SSH Tunnel to '{SSH_HOST}'...")
    print(f"   (Forwarding Local {LOCAL_DB_PORT} -> Remote {REMOTE_DB_PORT})")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sock.connect_ex(('127.0.0.1', LOCAL_DB_PORT)) == 0:
        print(f"❌ Port {LOCAL_DB_PORT} already in use — Terminating.")
        sock.close()
        return None
    sock.close()

    ssh_cmd = ["ssh", "-N", "-L", f"{LOCAL_DB_PORT}:127.0.0.1:{REMOTE_DB_PORT}", SSH_HOST]
    
    # Windows specific logic for process groups
    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    proc = subprocess.Popen(ssh_cmd, creationflags=creationflags)

    time.sleep(5)
   
    if proc.poll() is not None:
        print("❌ SSH Tunnel failed to start. Check SSH credentials/keys.")
        return None

    print("✅ SSH Tunnel running successfully.")
    return proc


def stop_ssh_tunnel(proc):
    """Terminates the SSH tunnel process."""
    if proc:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception as e:
            print(f"⚠️ Error stopping tunnel: {e}")
            try:
                proc.kill()
            except:
                pass
        print("\n🔌 SSH Tunnel terminated.")

# ==============================
# MAIN SCRIPT LOGIC
# ==============================
def main():
    connection = None
    cursor = None
    tunnel_process = None
   
    # 1. Start SSH Tunnel
    tunnel_process = start_ssh_tunnel()
    if not tunnel_process:
        print("🛑 Script stopped because SSH tunnel could not be established.")
        sys.exit(1)

    try:
        # ==============================
        # 🧩 Step 1: Connect to Database (via Tunnel)
        # ==============================
        try:
            connection = psycopg2.connect(**DB_CONFIG)
            cursor = connection.cursor()
            print(f"✅ Connected to database {DB_CONFIG['dbname']} (via SSH tunnel)")

           # -------------------------------------------------------------------
            # 🎯 NEW STEP: Get MULTIPLE Dynamic IDs from Mapping Table
            # -------------------------------------------------------------------
            print("\n🔄 Querying list_pricing_markup_mapping for dynamic IDs (LIMIT 10)...")
           
            cursor.execute("""
                    SELECT list_price_id, markup_id
                    FROM china.list_pricing_markup_mapping
                    LIMIT 10;
                    """)

            mapping_results = cursor.fetchall() 
           
            if not mapping_results:
                print("❌ FATAL: No rows found in china.list_pricing_markup_mapping. Cannot proceed.")
                sys.exit(1)
           
            found_valid_pair = False
            list_pricing_code = ""
            markup_code = ""

            for i, row in enumerate(mapping_results):
                dynamic_list_pricing_id = row[0]
                dynamic_markup_id = row[1]

                print(f"\n--- Attempt {i + 1} with LP ID: {dynamic_list_pricing_id} | MU ID: {dynamic_markup_id} ---")

                # --- 1. Fetch Markup Code ---
                query_mu = "SELECT code FROM china.markup WHERE id = %s;"
                cursor.execute(query_mu, (dynamic_markup_id,))
                markup_result = cursor.fetchone()
               
                # --- 2. Fetch List Pricing Code ---
                query_lp = "SELECT code FROM china.list_pricing WHERE id = %s;"
                cursor.execute(query_lp, (dynamic_list_pricing_id,))
                list_pricing_result = cursor.fetchone()

                if markup_result and list_pricing_result:
                    markup_code = markup_result[0]
                    list_pricing_code = list_pricing_result[0]
                    found_valid_pair = True
                    print(f"✅ Success! Found valid pair:")
                    print(f"   LP Code: {list_pricing_code}")
                    print(f"   MU Code: {markup_code}")
                    break 
                else:
                    if not markup_result:
                        print(f"❌ Markup code not found for ID {dynamic_markup_id}.")
                    if not list_pricing_result:
                        print(f"❌ List Pricing code not found for ID {dynamic_list_pricing_id}.")
                    print("🔄 Invalid pair. Trying next row...")

            if not found_valid_pair:
                print("\n❌ FATAL: Reached end of 10 rows. No valid (LP + MU) code pair found.")
                sys.exit(1)

            print(f"\n🏷️ Final list_pricing code: {list_pricing_code}")
            print(f"🏷️ Final markup code: {markup_code}")

            # -------------------------------------------------------------------
            # 🎯 FIXED LOGIC: Remove only the prefix (e.g. "CHINA-")
            # Example: "CHINA-0110-3825" -> "0110-3825"
            # -------------------------------------------------------------------
            list_pricing_code_numeric = "NOT_FOUND"
            if list_pricing_code and list_pricing_code != "NOT_FOUND":
                if '-' in list_pricing_code:
                    # Split by first dash only, keep the rest
                    parts = list_pricing_code.split('-', 1)
                    if len(parts) > 1:
                        # This keeps "0110-3825" intact
                        list_pricing_code_numeric = parts[1]
                    else:
                        list_pricing_code_numeric = list_pricing_code 
                else:
                    list_pricing_code_numeric = list_pricing_code
            
            print(f"🏷️ Final list_pricing code (Cleaned): {list_pricing_code_numeric}")

        except Exception as e:
            print(f"❌ Database error: {e}", file=sys.stderr)
            print("🛑 Terminating script due to database error.")
            sys.exit(1)

        finally:
            if cursor: cursor.close()
            if connection: connection.close()
            print("🔒 Database connection closed.")

        # ==============================
        # 🧩 Step 2: Run Playwright Test
        # ==============================
        
        # Prepare environment variables for the Playwright script
        env_vars = os.environ.copy()
        env_vars["DYNAMIC_LP_CODE"] = str(list_pricing_code_numeric)
        env_vars["DYNAMIC_MU_CODE"] = str(markup_code)
        
        # Get Config for URL Construction
        ui_url = CURRENT_CONFIG.get("UI_URL", "https://dev-spriced-cdbu.alpha.simadvisory.com/")
        auth_base = CURRENT_CONFIG.get("AUTH_BASE_URL", "https://auth.alpha.simadvisory.com")
        auth_realm = CURRENT_CONFIG.get("AUTH_REALM", "D_SPRICED")
        auth_client = CURRENT_CONFIG.get("AUTH_CLIENT_ID", "CHN_D_SPRICED_Client")
        
        # Construct dynamic Auth URL parameters
        redirect_uri = ui_url
        state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82' 
        nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e' 

        # Note: We pass these as strings to the JS template
        
        js_code = f"""const {{ chromium, expect }} = require('playwright/test'); // Import expect

(async () => {{
    const browser = await chromium.launch({{ headless: false }});
    const context = await browser.newContext();
    const page = await context.newPage();

    // Dynamic Auth URL Construction
    const authBase = '{auth_base}';
    const authRealm = '{auth_realm}';
    const authClient = '{auth_client}';
    const redirectUri = '{redirect_uri}';
    const state = '{state}';
    const nonce = '{nonce}';
    
    const authUrl = `${{authBase}}/realms/${{authRealm}}/protocol/openid-connect/auth?client_id=${{authClient}}&redirect_uri=${{encodeURIComponent(redirectUri)}}&state=${{state}}&response_mode=fragment&response_type=code&scope=openid&nonce=${{nonce}}`;

    console.log(`🚀 Navigating to Login: ${{authUrl}}`);
    await page.goto(authUrl);

    // 🔐 Login
    await page.getByRole('textbox', {{ name: 'Username or email' }}).fill('moloy');
    await page.getByRole('textbox', {{ name: 'Password' }}).fill('qwerty');
    await page.getByRole('button', {{ name: 'Sign In' }}).click();
    // ----------------- Navigate to Data Explorer -----------------
    await page.getByText('Data Explorer').click();
    await page.waitForLoadState('networkidle');

    // 🧭 Navigate to List Pricing
    await page.getByRole('combobox', {{ name: 'Part' ,timeout: 30000}}).locator('svg').click();
    await page.getByRole('option', {{ name: 'List Pricing' }}).locator('span').click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', {{ name: 'Filter', exact: true }}).click();
    await page.getByRole('button', {{ name: 'Rule', exact: true }}).click();
    await page.getByRole('combobox', {{ name: 'Code' }}).locator('path').click();
    await page.getByRole('option', {{ name: 'Part Number', exact: true }}).locator('span').click();
    await page.locator('#mat-input-93').waitFor({{ state: 'visible', timeout: 90000 }});
    await page.locator('#mat-input-93').click();
    await page.getByRole('button', {{ name: 'selectItem' }}).click();
    await page.getByRole('button', {{ name: 'Add Filter' }}).click();

    await page.locator('#mat-mdc-dialog-2').getByRole('button', {{ name: 'Rule', exact: true }}).click();
    await page.locator('#mat-input-94').click();
    await page.locator('#mat-input-94').fill('{list_pricing_code_numeric}');
    await page.locator('#mat-mdc-dialog-2').getByRole('button', {{ name: 'Apply' }}).click();
    await page.getByText('{list_pricing_code_numeric}').click();
    await page.getByRole('button', {{ name: 'Submit' }}).click();
    await page.getByRole('button', {{ name: 'Apply' }}).click();
    
    // NEW: Extract "Markup Factor for Local Currency List Price"
    // Using a robust locator strategy (sp-numeric by label)
    const lpMarkupFactorInput = page.locator('sp-numeric').filter({{ hasText: 'Markup Factor for Local Currency List Price' }}).locator('input').first();
    await lpMarkupFactorInput.waitFor({{ state: 'visible', timeout: 30000 }});
    let lpMarkupValue = await lpMarkupFactorInput.inputValue();
    // Clean value (remove commas, trim)
    lpMarkupValue = lpMarkupValue ? parseFloat(lpMarkupValue.replace(/,/g, '').trim()) : 0;
    console.log(`📊 LP Markup Factor: ${{lpMarkupValue}}`);


    // 🧩 Open new page for markup comparison
    const page1 = await context.newPage();
    await page1.goto('{ui_url}spriced-data');
    await page1.getByRole('combobox', {{ name: 'List Pricing' }}).locator('svg').click();
    await page1.getByText('006 Markup').click();
    await page1.getByRole('button', {{ name: 'Filter', exact: true }}).click();
    await page1.getByRole('button', {{ name: 'Rule', exact: true }}).click();
    await page1.locator('#mat-input-124').click();
    await page1.locator('#mat-input-124').fill('{markup_code}');
    await page1.getByRole('button', {{ name: 'Apply' }}).click();
    
    // NEW: Extract "Current CM Markup Factor"
    const cmMarkupFactorInput = page1.locator('sp-numeric').filter({{ hasText: 'Current CM Markup Factor' }}).locator('input').first();
    await cmMarkupFactorInput.waitFor({{ state: 'visible', timeout: 30000 }});
    let cmMarkupValue = await cmMarkupFactorInput.inputValue();
    cmMarkupValue = cmMarkupValue ? parseFloat(cmMarkupValue.replace(/,/g, '').trim()) : 0;
    console.log(`📊 Current CM Markup Factor: ${{cmMarkupValue}}`);
    
    // NEW: Compare Values
    if (Math.abs(lpMarkupValue - cmMarkupValue) < 0.001) {{
        console.log("✅ PASS: Markup factors match.");
    }} else {{
        console.error(`❌ FAIL: Mismatch! LP Markup: ${{lpMarkupValue}} vs CM Markup: ${{cmMarkupValue}}`);
        process.exit(1); // Fail the script
    }}

    await browser.close();
}})();
"""
        js_file = os.path.join(os.getcwd(), "core-temp.js")
        with open(js_file, "w", encoding="utf-8") as f:
            f.write(js_code)

        print(f"\n🚀 Running generated Playwright script...\n")
        subprocess.run(["node", js_file], env=env_vars)

    except KeyboardInterrupt:
        print("\n⚠️ Script interrupted by user.")
   
    finally:
        stop_ssh_tunnel(tunnel_process)


if __name__ == "__main__":
    main()