import os
import sys
from pathlib import Path

def update_shortcut():
    desktop = Path(os.environ["USERPROFILE"]) / "Desktop"
    lnk_path = desktop / "ThermalLabPro License Manager.lnk"
    bat_path = desktop / "ThermalLabPro License Manager.bat"

    # 1. Create .bat launcher as robust fallback
    pyw = Path(sys.executable).parent / "pythonw.exe"
    if not pyw.exists():
        pyw = Path(sys.executable)
    
    script_path = Path(r"C:\Users\Eng_Ahmed\Desktop\label\license_manager\main.py")
    cwd = Path(r"C:\Users\Eng_Ahmed\Desktop\label")

    bat_content = f'@echo off\ncd /d "{cwd}"\nstart "" "{pyw}" "{script_path}"\n'
    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(bat_content)

    # 2. Update .lnk shortcut via powershell script
    ps_cmd = f"""
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('{lnk_path}')
    $Shortcut.TargetPath = '{pyw}'
    $Shortcut.Arguments = '`"{script_path}`"'
    $Shortcut.WorkingDirectory = '{cwd}'
    $Shortcut.IconLocation = '{cwd / "assets" / "app_icon.ico"}, 0'
    $Shortcut.Description = 'ThermalLabPro License Manager Studio'
    $Shortcut.Save()
    """
    import subprocess
    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
    print("PS output:", res.stdout, res.stderr)
    print(f"Shortcut and batch created at {lnk_path} and {bat_path}")

if __name__ == "__main__":
    update_shortcut()
