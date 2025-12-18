from flask import Flask, request, jsonify, render_template, send_from_directory
import subprocess
import os
import re
import sqlite3
import json
from datetime import datetime
import sys
import time
import logging

# ==========================================
# 1. LOGGING CONFIGURATION
# ==========================================
# Configure logging to show timestamp, level, and message
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Log to console
        # You can add FileHandler here if you want to save server logs to a file
    ]
)
logger = logging.getLogger("TestRunner")

app = Flask(__name__)

# =================================================
# 🛑 FIX: PREVENT BROWSER CACHING
# =================================================
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# ----------------------------
# CONFIG
# ----------------------------
if sys.platform.startswith("win"):
    NODE_PATH = r"C:\Program Files\nodejs\node.exe"
else:
    NODE_PATH = "/usr/bin/node"

PROJECT_ROOT = os.getcwd() 
PLAYWRIGHT_CLI = os.path.join(PROJECT_ROOT, "node_modules", "@playwright", "test", "cli.js")
TEST_RESULTS_DIR = os.path.join(PROJECT_ROOT, "test-results")
DB_PATH = os.path.join(PROJECT_ROOT, "test_history.db")

ENV_URLS = {
    "cdbu_dev": "https://dev-spriced-cdbu.alpha.simadvisory.com/",
    "cdbu_qa": "https://qa-spriced-cdbu.alpha.simadvisory.com/",
    "nrp_dev": "https://dev-spriced-nrp.alpha.simadvisory.com/"
}

# Test Files
CHINA_TEST_FILES = [
    # "china-syscountry-attribute-movement.spec.js",
    # "china-user-override.spec.js",
    # "china-approval.spec.js",
    "dbpoll.spec.js", 
    # "china-pricing-action.spec.js",
    # "china-flow-Business-rule.spec.js",
    # "china-stocking.spec.js",
    # "china-list-pricing.spec.js",
    # "Reports.spec.js"
]

NRP_TEST_FILES = []
PSBU_TEST_FILES = []

# Python Post-Execution Scripts
PYTHON_POST_EXECUTION_SCRIPTS = [
    # "tests/inbound-sales.py"
]

# ----------------------------
# DATABASE FUNCTIONS
# ----------------------------
def init_db():
    """Initialize the database with required tables"""
    logger.info(f"🛠️  Initializing database at: {DB_PATH}")
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS test_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL,
                execution_date DATE NOT NULL,
                execution_time TIME NOT NULL,
                platform TEXT NOT NULL,
                total_tests INTEGER NOT NULL,
                passed_tests INTEGER NOT NULL,
                failed_tests INTEGER NOT NULL,
                failed_tests_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        logger.info("✅ Database initialized successfully.")
        return True
    except Exception as e:
        logger.error(f"❌ Error initializing database: {e}")
        return False

def clear_db():
    """Clears all previous test execution history."""
    logger.info("🗑️  Clearing previous test history from database...")
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        c = conn.cursor()
        c.execute('DELETE FROM test_executions')
        c.execute('DELETE FROM sqlite_sequence WHERE name="test_executions"')
        conn.commit()
        c.execute('VACUUM')
        conn.commit()
        conn.close()
        logger.info("✅ Database cleared successfully.")
        return True
    except Exception as e:
        logger.error(f"❌ Error clearing database: {e}")
        return False

def save_execution_to_db(project_name, total_tests, passed_tests, failed_tests, failed_tests_list, platform='UAT'):
    """Save test execution results to database"""
    logger.info(f"💾 Saving execution results for {project_name} ({platform})...")
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        c = conn.cursor()
        
        now = datetime.now()
        execution_date = now.strftime('%Y-%m-%d')
        execution_time = now.strftime('%H:%M:%S')
        
        c.execute('''
            INSERT INTO test_executions 
            (project_name, execution_date, execution_time, platform, 
             total_tests, passed_tests, failed_tests, failed_tests_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (project_name, execution_date, execution_time, platform,
              total_tests, passed_tests, failed_tests, 
              json.dumps(failed_tests_list)))
        
        execution_id = c.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Results saved! [ID: {execution_id}] - Passed: {passed_tests}/{total_tests}")
        return execution_id
    except Exception as e:
        logger.error(f"❌ Error saving to database: {e}")
        return None

# ----------------------------
# API: GET HISTORY
# ----------------------------
@app.route('/api/get-history')
def get_history():
    logger.info("📥 API Request: /api/get-history")
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        c = conn.cursor()
        
        c.execute('''
            SELECT id, project_name, execution_date, execution_time, platform,
                   total_tests, passed_tests, failed_tests, failed_tests_json
            FROM test_executions
            ORDER BY created_at DESC
            LIMIT 100
        ''')
        
        rows = c.fetchall()
        conn.close()
        
        history = []
        for row in rows:
            time_str = row[3][:5] if len(row[3]) > 5 else row[3]
            history.append({
                'id': f'proj_{row[0]}',
                'name': row[1],
                'date': row[2],
                'time': time_str,
                'platform': row[4],
                'totalTests': row[5],
                'passed': row[6],
                'failed': row[7],
                'failedTests': json.loads(row[8]) if row[8] else []
            })
        
        logger.info(f"📊 Returned {len(history)} history records.")
        return jsonify({'history': history, 'success': True})
        
    except Exception as e:
        logger.error(f"❌ Error fetching history: {e}")
        return jsonify({'history': [], 'success': False, 'error': str(e)})


# ----------------------------
# ROUTES: SERVE STATIC FILES
# ----------------------------
@app.route("/")
def home():
    logger.info("🌐 Serving Home Page")
    return render_template("index.html")

@app.route("/logs/<project>/<filename>")
def serve_log(project, filename):
    return send_from_directory(os.path.join(PROJECT_ROOT, "logs", project), filename)

@app.route("/test-results/<path:filename>")
def serve_test_results(filename):
    return send_from_directory(TEST_RESULTS_DIR, filename)


# ----------------------------
# CORE: RUN PLAYWRIGHT TESTS (JS)
# ----------------------------

def run_test_group(test_files, project_name, target_env_url):
    if not test_files:
        logger.warning("🚫 No test files configured. Skipping Playwright execution.")
        return []

    logger.info(f"🚀 Starting Playwright Test Group: {project_name}")
    logger.info(f"🎯 Target Environment: {target_env_url}")
    logger.critical(f"TEST FILES RECEIVED: {test_files}")

    results = []
    full_log = ""

    log_dir = os.path.join(PROJECT_ROOT, "logs", project_name)
    os.makedirs(log_dir, exist_ok=True)

    # Prepare environment variables
    env_vars = os.environ.copy()
    env_vars["BASE_URL"] = target_env_url
    env_vars["TEST_ENV_NAME"] = "QA" if "qa" in target_env_url.lower() else "DEV"

    logger.info(f"⚙️ ENV Configured: TEST_ENV_NAME={env_vars['TEST_ENV_NAME']}")

    for test_file in test_files:
        logger.info(f"🔄 Executing Test File: {test_file}")

        test_path = os.path.join(PROJECT_ROOT, "tests", test_file)
        if not os.path.isfile(test_path):
            logger.error(f"❌ Test file NOT FOUND: {test_path}")
            continue

        cmd = [
            NODE_PATH,
            PLAYWRIGHT_CLI,
            "test",
            test_path,
            "--headed",
            "--reporter=line"
        ]

        try:
            logger.critical(f"PLAYWRIGHT CMD: {' '.join(cmd)}")

            process = subprocess.Popen(
                cmd,
                cwd=PROJECT_ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env_vars
            )

            stdout = ""
            for line in process.stdout:
                sys.stdout.write(line)
                stdout += line

            process.wait()

            status = "PASS" if "passed" in stdout.lower() else "FAIL"
            logger.info(f"{'✅' if status == 'PASS' else '❌'} Finished {test_file}: {status}")

            log_filename = test_file.replace(".spec.js", ".log")
            with open(os.path.join(log_dir, log_filename), "w", encoding="utf-8") as f:
                f.write(
                    f"--- {test_file} [{status}] ---\n"
                    f"--- ENV: {target_env_url} ---\n\n"
                    f"{stdout}"
                )

            results.append({
                "file": test_file,
                "status": status,
                "stdout": stdout,
                "logFile": f"/logs/{project_name}/{log_filename}"
            })

            full_log += f"\n--- {test_file} [{status}] ---\n{stdout}\n"

        except Exception as e:
            logger.exception(f"❌ Exception running {test_file}: {e}")

    # Save combined log
    with open(os.path.join(log_dir, f"{project_name}_combined.log"), "w", encoding="utf-8") as f:
        f.write(full_log)

    return results


# ----------------------------
# CORE: RUN PYTHON SCRIPTS
# ----------------------------
def run_python_scripts(scripts_list, project_name, target_env_url):
    if not scripts_list:
        logger.info("➡️ No Python scripts configured to run.")
        return

    logger.info(f"🐍 Starting Python Post-Execution Scripts for {project_name}")
    
    log_dir = os.path.join(PROJECT_ROOT, "logs", project_name)
    os.makedirs(log_dir, exist_ok=True)
    
    python_executable = sys.executable 
    env_vars = os.environ.copy()
    env_vars["PYTHONIOENCODING"] = "utf-8"
    env_vars["BASE_URL"] = target_env_url
    
    # Determine ENV logic
    if "qa" in target_env_url.lower():
        env_vars["TEST_ENV_NAME"] = "QA"
    else:
        env_vars["TEST_ENV_NAME"] = "DEV"

    for script_file in scripts_list:
        script_path = os.path.join(PROJECT_ROOT, script_file)
        
        if not os.path.exists(script_path):
            logger.warning(f"⚠️ Script not found: {script_path}. Skipping.")
            continue

        logger.info(f"🔥 Running Script: {script_file} [ENV: {env_vars['TEST_ENV_NAME']}]")
        
        cmd = [python_executable, script_path]
        status = "PASS"
        output_content = ""

        try:
            result = subprocess.run(
                cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, 
                encoding="utf-8", check=False, env=env_vars
            )
            
            output_content = result.stdout
            if result.stderr:
                output_content += "\n--- STDERR ---\n" + result.stderr

            print(output_content) # Show output in console too

            if result.returncode != 0:
                status = "FAIL"
                logger.error(f"❌ Script failed (Exit Code {result.returncode})")
            elif "FAIL" in output_content or "Error:" in output_content:
                status = "FAIL"
                logger.error("❌ Script output contains failure keywords.")
            else:
                logger.info("✅ Script finished successfully.")

        except Exception as e:
            status = "FAIL"
            logger.exception(f"❌ Exception executing script {script_file}: {e}")
            output_content += f"\nException: {e}"

        # Write Log
        log_filename = os.path.basename(script_file).replace('.py', '.log')
        if log_filename == os.path.basename(script_file): log_filename += ".log"
        
        try:
            with open(os.path.join(log_dir, log_filename), "w", encoding="utf-8") as f:
                f.write(f"--- {script_file} [{status}] ---\n--- ENV: {target_env_url} ---\n{output_content}")
        except Exception as e:
            logger.error(f"❌ Failed to write log for {script_file}: {e}")

    logger.info("🏁 Python scripts execution completed.")


# ----------------------------
# LOG ANALYSIS
# ----------------------------
def check_log_file(log_path):
    if not os.path.exists(log_path): return "FAIL"
    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    failure_patterns = [r"\bFAIL\b", r"Error:", r"Test timeout", r"AssertionError", r"Traceback"]
    for pattern in failure_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            return "FAIL"
    return "PASS"

def process_logs_for_project(project_name):
    logger.info(f"📊 Analyzing logs for project: {project_name}")
    log_dir = os.path.join(PROJECT_ROOT, "logs", project_name)
    
    if not os.path.exists(log_dir):
        logger.warning("⚠️ No logs directory found.")
        return {"projectStatus": "FAIL", "tests": []}

    test_results = []
    project_status = "PASS"

    for file_name in os.listdir(log_dir):
        if file_name.endswith(".log") and "combined" not in file_name.lower():
            status = check_log_file(os.path.join(log_dir, file_name))
            if status == "FAIL": project_status = "FAIL"

            display_name = file_name.replace(".log", ".spec.js") 
            # Check if it was a python script log
            if os.path.exists(os.path.join(PROJECT_ROOT, "tests", file_name.replace(".log", ".py"))):
                display_name = file_name.replace(".log", ".py")

            test_results.append({
                "file": display_name, "status": status, 
                "logFile": f"/logs/{project_name}/{file_name}"
            })
    
    logger.info(f"📊 Analysis Complete. Status: {project_status}")
    return {"projectStatus": project_status, "tests": test_results}


# ----------------------------
# MAIN ORCHESTRATOR
# ----------------------------
def execute_and_process(project_name, test_files, env_key):
    log_dir = os.path.join(PROJECT_ROOT, "logs", project_name)
    if os.path.exists(log_dir):
        for f in os.listdir(log_dir):
            os.remove(os.path.join(log_dir, f))

    logger.info(f"\n{'='*40}\n🚀 STARTING EXECUTION: {project_name} [{env_key}]\n{'='*40}")
    
    clear_db()
    
    target_url = ENV_URLS.get(env_key, "UNKNOWN_ENV")
    platform_label = env_key.upper().replace('_', ' ')
    
    if target_url == "UNKNOWN_ENV":
        logger.warning(f"⚠️ Unknown env key '{env_key}', defaulting to DEV.")
        target_url = ENV_URLS['cdbu_dev']

    # 1. Run Playwright
    run_test_group(test_files, project_name, target_url)
    
    # 2. Run Python
    run_python_scripts(PYTHON_POST_EXECUTION_SCRIPTS, project_name, target_url)
    
    # 3. Analyze & Save
    result = process_logs_for_project(project_name)
    tests = result.get('tests', [])
    passed = len([t for t in tests if t['status'] == 'PASS'])
    failed = len(tests) - passed
    failed_list = [{'file': t['file'], 'logFile': t['logFile']} for t in tests if t['status'] == 'FAIL']
    
    execution_id = save_execution_to_db(
        project_name, len(tests), passed, failed, failed_list, platform_label
    )
    
    result['platform'] = platform_label
    result['executionId'] = execution_id
    
    logger.info(f"🏁 EXECUTION FINISHED. Passed: {passed}, Failed: {failed}")
    return result


# ----------------------------
# API ENDPOINTS (TRIGGERS)
# ----------------------------
@app.route("/run-china-tests")
def run_china_tests():
    env = request.args.get('env', 'cdbu_dev')
    return jsonify(execute_and_process("China Project", CHINA_TEST_FILES, env))

@app.route("/run-nrp-tests")
def run_nrp_tests():
    env = request.args.get('env', 'nrp_dev')
    return jsonify(execute_and_process("NRP Project", NRP_TEST_FILES, env))

@app.route("/run-psbu-tests")
def run_psbu_tests():
    env = request.args.get('env', 'cdbu_dev')
    return jsonify(execute_and_process("PSBU Project", PSBU_TEST_FILES, env))

@app.route('/api/clear-history', methods=['POST'])
def clear_history():
    return jsonify({'success': clear_db()})

@app.route('/api/stats')
def get_stats():
    logger.info("📥 API Request: /api/stats")
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM test_executions')
        total = c.fetchone()[0]
        c.execute('SELECT SUM(total_tests), SUM(passed_tests), SUM(failed_tests) FROM test_executions')
        stats = c.fetchone()
        conn.close()
        return jsonify({
            'success': True, 'totalExecutions': total,
            'totalTests': stats[0] or 0, 'totalPassed': stats[1] or 0, 'totalFailed': stats[2] or 0
        })
    except Exception as e:
        logger.error(f"❌ Error fetching stats: {e}")
        return jsonify({'success': False, 'error': str(e)})


# ----------------------------
# ENTRY POINT
# ----------------------------
if __name__ == "__main__":
    logger.info("="*50)
    logger.info("🎯 SIM Test Execution Suite Starting...")
    logger.info("="*50)
    
    if init_db():
        logger.info(f"📂 Project Root: {PROJECT_ROOT}")
        logger.info("🌐 Server listening on http://localhost:5000")
        app.run(port=5000, debug=False, use_reloader=False)
    else:
        logger.critical("❌ Failed to initialize database. Aborting.")