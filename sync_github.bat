@echo off
chcp 65001 > nul
title ThermalLabPro - GitHub Two-Way Synchronization
color 0B
echo ===============================================================================
echo        ThermalLabPro Commercial ERP - المزامنة التلقائية مع GitHub
echo ===============================================================================
echo  [+] Repository:     https://github.com/Ahmedgad5on/phone-repair-erp
echo  [+] Branch:         main
echo  [+] Mode:           Bidirectional (Two-Way Sync: Pull + Push)
echo ===============================================================================
echo.
cd /d "C:\Users\Eng_Ahmed\Desktop\label"
"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" -c "
import sys
from core.github_sync import GitHubSyncManager

mgr = GitHubSyncManager()
print('🔍 جاري التحقق من الاتصال بمستودع GitHub...')
if not mgr.check_connection():
    print('❌ تعذر الاتصال بمستودع GitHub. تأكد من اتصال الإنترنت.')
    sys.exit(1)

print('⚡ جاري تنفيذ المزامنة التلقائية في الاتجاهين (سحب ورفع)...')
ok, msg = mgr.sync_two_way()
if ok:
    print('✅ ' + msg)
else:
    print('❌ ' + msg)
    sys.exit(1)
"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================================================
    echo  [OK] اكتملت عملية المزامنة بنجاح تام! كافة التعديلات متبادلة الآن.
    echo ===============================================================================
) else (
    echo.
    echo [!] حدث تنبيه أو تعذر استكمال المزامنة.
)
timeout /t 5
