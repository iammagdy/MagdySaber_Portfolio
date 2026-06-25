import paramiko
import os

HOST = "82.29.154.120"
PORT = 65002
USER = "u966279061"
PASS = "M@gdy3041"
LOCAL_DIR = os.path.dirname(__file__)

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect(HOST, port=PORT, username=USER, password=PASS, timeout=30)
sftp = s.open_sftp()

# ─── Deploy API server ───
print("=== Deploying API Server ===")
api_local = os.path.join(LOCAL_DIR, "artifacts", "api-server", "dist")
api_remote = "domains/api.magdysaber.com/nodejs"
for fname in ["index.mjs", "index.mjs.map"]:
    lp = os.path.join(api_local, fname)
    sz = os.path.getsize(lp) / (1024*1024)
    print(f"  {fname} ({sz:.1f} MB)...", end=" ", flush=True)
    sftp.put(lp, f"{api_remote}/{fname}")
    print("done")

# Restart API
stdin, stdout, stderr = s.exec_command(f"touch {api_remote}/tmp/restart.txt")
stdout.read()
print("  API restart triggered.")

# ─── Deploy Frontend ───
print("\n=== Deploying Frontend ===")
fe_local = os.path.join(LOCAL_DIR, "artifacts", "portfolio", "dist", "public")
fe_remote = "domains/magdysaber.com/public_html"

# Clean old hashed assets to avoid stale files
try:
    for f in sftp.listdir(f"{fe_remote}/assets"):
        sftp.remove(f"{fe_remote}/assets/{f}")
    print("  Cleaned old assets.")
except Exception as e:
    print(f"  Asset cleanup: {e}")

def upload_dir(local, remote):
    for item in os.listdir(local):
        lp = os.path.join(local, item)
        rp = f"{remote}/{item}"
        if os.path.isdir(lp):
            try: sftp.mkdir(rp)
            except: pass
            upload_dir(lp, rp)
        else:
            sz = os.path.getsize(lp) / 1024
            print(f"  {rp} ({sz:.0f} KB)...", end=" ", flush=True)
            sftp.put(lp, rp)
            print("done")

upload_dir(fe_local, fe_remote)

sftp.close()
s.close()
print("\n=== Deployment Complete ===")
