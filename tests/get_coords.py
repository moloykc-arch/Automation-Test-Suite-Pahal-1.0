import pyautogui

print("🎯 INTERACTIVE COORDINATE FINDER")
print("------------------------------------------------")
print("⚠️ Keep this terminal active. Move your mouse to the target, then press ENTER here to capture.")

input("\n1️⃣  Move mouse to the center of the FILEZILLA WINDOW... [Press Enter]")
print(f"   ✅ Window Focus: {pyautogui.position()}")

input("\n2️⃣  Move mouse to the SITE MANAGER ICON (top-left toolbar)... [Press Enter]")
print(f"   ✅ Site Manager Icon: {pyautogui.position()}")

print("\n👉 CLICK the icon manually now so the popup opens!")
input("\n3️⃣  Move mouse to the CONNECT button inside the popup... [Press Enter]")
print(f"   ✅ Connect Button: {pyautogui.position()}")