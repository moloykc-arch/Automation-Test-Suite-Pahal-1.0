import paramiko

# Configuration
HOST = "106.51.91.59"
USER = "cfg"
KEY_PATH = "/home/malay/.ssh/id_rsa"

def list_sftp_folders():
    try:
        # Connect
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(HOST, username=USER, key_filename=KEY_PATH)
        
        sftp = ssh.open_sftp()
        print(f"✅ Connected via SFTP")
        
        # FORCE check of the root directory
        path_to_check = "/"
        print(f"📂 Checking contents of: {path_to_check}")
        
        files = sftp.listdir(path_to_check)
        for f in files:
            print(f" - {f}")

        sftp.close()
        ssh.close()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    list_sftp_folders()