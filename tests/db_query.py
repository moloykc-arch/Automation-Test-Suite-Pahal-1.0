import subprocess
import time
import psycopg2
import sys
import socket


# ==========================================
# CONFIGURATION
# ==========================================
SSH_HOST = "simw01"
LOCAL_PORT = 6001
REMOTE_DB_PORT = 5432

DB_CONFIG = {
    "dbname": "dev_spriced",
    "user": "china_app",
    "password": "admin_china_app",
    "host": "127.0.0.1",
    "port": LOCAL_PORT
}

def start_ssh_tunnel():
    print(f"\n🚀 Launching SSH Tunnel to '{SSH_HOST}'...")
    print(f"   (Forwarding Local {LOCAL_PORT} -> Remote {REMOTE_DB_PORT})")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sock.connect_ex(('127.0.0.1', LOCAL_PORT)) == 0:
        print(f"❌ Port {LOCAL_PORT} already in use — change LOCAL_PORT\n")
        return None
    sock.close()

    ssh_cmd = ["ssh", "-N", "-L", f"{LOCAL_PORT}:127.0.0.1:{REMOTE_DB_PORT}", SSH_HOST]
    proc = subprocess.Popen(ssh_cmd)

    time.sleep(5)
    if proc.poll() is not None:
        print("❌ SSH Tunnel failed to start.")
        return None

    print("✅ SSH Tunnel running successfully.")
    return proc


def stop_ssh_tunnel(proc):
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("\n🔌 SSH Tunnel terminated.")


def print_table(cursor, rows):
    """Prints fetched data in a nicely formatted table."""
    if not rows:
        print("\n(No rows returned)")
        return

    # Get column names
    colnames = [desc[0] for desc in cursor.description]
    
    # Calculate column widths
    col_widths = [len(name) for name in colnames]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))

    # Create format string (e.g., "{:<10} | {:<20} | ...")
    fmt = " | ".join([f"{{:<{w}}}" for w in col_widths])
    separator = "-+-".join(["-" * w for w in col_widths])

    print("\n" + separator)
    print(fmt.format(*colnames))
    print(separator)
    
    for row in rows:
        # Convert all values to string for printing
        row_str = [str(val) if val is not None else "NULL" for val in row]
        print(fmt.format(*row_str))
    print(separator + "\n")


def database_flow():
    connection = None
    cursor = None
    try:
        print(f"\n🚀 Connecting to DB on local port {LOCAL_PORT}...")
        connection = psycopg2.connect(**DB_CONFIG)
        cursor = connection.cursor()
        print("✅ Connected to database china_dbu_dev")

        while True:
            # ---------------------------------------------------------
            # User Input Logic
            # ---------------------------------------------------------
            print("\n" + "="*50)
            print("📝 ENTER YOUR SQL QUERY BELOW (Single line)")
            print("="*50)
            
            user_query = input("SQL > ").strip()

            if not user_query:
                print("⚠️ No query entered.")
            else:
                try:
                    print(f"\n🔄 Executing...")
                    cursor.execute(user_query)

                    # Check if the query returns data (SELECT) or just modifies rows
                    if cursor.description:
                        rows = cursor.fetchall()
                        print(f"🎉 Query executed successfully! Rows returned: {len(rows)}")
                        print_table(cursor, rows)
                    else:
                        connection.commit()
                        print(f"✅ Query executed. Rows affected: {cursor.rowcount}")
                except Exception as query_err:
                    print(f"❌ Query Error: {query_err}")
                    connection.rollback() # Rollback to allow further queries

            # ---------------------------------------------------------
            # Loop Decision
            # ---------------------------------------------------------
            print("\n👉 Enter 0 to Continue | 1 to Close")
            choice = input("Choice > ").strip()
            
            if choice == '1':
                print("👋 Exiting database session...")
                break
            elif choice != '0':
                print("⚠️ Invalid input, continuing session...")

    except Exception as e:
        print(f"\n❌ Database Connection Error: {e}")

    finally:
        if cursor: cursor.close()
        if connection: connection.close()
        print("🔒 Closed DB connection")


def main():
    # Force UTF-8 output for Windows terminals
    sys.stdout.reconfigure(encoding='utf-8')

    proc = start_ssh_tunnel()
    if not proc:
        return

    try:
        database_flow()
    except KeyboardInterrupt:
        print("\n⚠️ Interrupted by user.")
    finally:
        stop_ssh_tunnel(proc)


if __name__ == "__main__":
    main()