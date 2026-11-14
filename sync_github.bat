@echo off
chcp 65001 > nul
title ThermalLabPro - GitHub Two-Way Synchronization Hub
color 0B

:MENU
cls
echo ===============================================================================
echo        ThermalLabPro Commercial ERP - أداة المزامنة التلقائية مع GitHub
echo ===============================================================================
echo  [+] المستودع السحابي:  https://github.com/Ahmedgad5on/phone-repair-erp
echo  [+] الفرع النشط:        main (متزامن مع master)
echo  [+] نوع المزامنة:      اتجاهين كاملين (Two-Way Sync: Pull + Push)
echo ===============================================================================
echo.
echo  اختر العملية المطلوبة:
echo  -------------------------------------------------------------------------------
echo   [1] مزامنة فورية في الاتجاهين (سحب آخر التحديثات ورفع التعديلات المحلية)
echo   [2] مزامنة سريعة ثم تشغيل البرنامج الأساسي مباشرة
echo   [3] تشغيل المزامنة المستمرة التلقائية (Live Background Sync)
echo   [4] فحص حالة المستودع وعدد التحديثات المعلقة (Status Check)
echo   [5] فتح رابط المستودع على GitHub في المتصفح
echo   [6] خروج
echo -------------------------------------------------------------------------------
set /p choice=" أدخل رقم الخيار [1-6]: "

if "%choice%"=="1" goto SYNC_NOW
if "%choice%"=="2" goto SYNC_AND_RUN
if "%choice%"=="3" goto WATCH_SYNC
if "%choice%"=="4" goto STATUS_CHECK
if "%choice%"=="5" goto OPEN_GITHUB
if "%choice%"=="6" goto EXIT_SCRIPT

echo اختيار غير صحيح!
timeout /t 2 > nul
goto MENU

:SYNC_NOW
cls
echo ===============================================================================
echo  [+] جاري تنفيذ المزامنة في الاتجاهين مع GitHub...
echo ===============================================================================
echo.
cd /d "C:\Users\Eng_Ahmed\Desktop\label"
"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" -c "
import sys
from core.github_sync import GitHubSyncManager

mgr = GitHubSyncManager()
print('🔍 التحقق من الاتصال بمستودع GitHub...')
if not mgr.check_connection():
    print('❌ تعذر الاتصال بمستودع GitHub. تأكد من توفر الإنترنت.')
    sys.exit(1)

print('⚡ مزامنة التغييرات (سحب التحديثات ورفع التعديلات)...')
ok, msg = mgr.sync_two_way()
if ok:
    print('✅ ' + msg)
else:
    print('❌ ' + msg)
    sys.exit(1)
"
echo.
echo اضغط أي مفتاح للعودة للقائمة...
pause > nul
goto MENU

:SYNC_AND_RUN
cls
echo ===============================================================================
echo  [+] مزامنة ثم تشغيل التطبيق...
echo ===============================================================================
echo.
cd /d "C:\Users\Eng_Ahmed\Desktop\label"
"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" -c "
from core.github_sync import GitHubSyncManager
mgr = GitHubSyncManager()
ok, msg = mgr.sync_two_way()
print(('✅ ' if ok else '⚠️ ') + msg)
"
echo.
echo  🚀 جاري تشغيل التطبيق الأساسي ThermalLabPro...
start "" "C:\Users\Eng_Ahmed\Desktop\ThermalLabPro.exe"
exit

:WATCH_SYNC
cls
echo ===============================================================================
echo  [+] وضع المراقبة والمزامنة المستمرة (يتم التحقق كل 60 ثانية)...
echo      [اضغط Ctrl+C للإيقاف في أي وقت]
echo ===============================================================================
echo.
cd /d "C:\Users\Eng_Ahmed\Desktop\label"
:WATCH_LOOP
"C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" -c "
from datetime import datetime
from core.github_sync import GitHubSyncManager
mgr = GitHubSyncManager()
state = mgr.get_sync_state()
now = datetime.now().strftime('%H:%M:%S')
if state.get('has_local_changes') or state.get('ahead', 0) > 0 or state.get('behind', 0) > 0:
    print(f'[{now}] 🔄 اكتشاف تحديثات! جاري المزامنة...')
    ok, msg = mgr.sync_two_way()
    print(f'[{now}] ' + ('✅ ' if ok else '❌ ') + msg)
else:
    print(f'[{now}] ✅ لا توجد تغييرات جديدة - المستودع متطابق مع GitHub.')
"
timeout /t 60 > nul
goto WATCH_LOOP

:STATUS_CHECK
cls
echo ===============================================================================
echo  [+] فحص حالة المستودع:
echo ===============================================================================
echo.
cd /d "C:\Users\Eng_Ahmed\Desktop\label"
git status
echo.
git log -3 --oneline
echo.
pause
goto MENU

:OPEN_GITHUB
start https://github.com/Ahmedgad5on/phone-repair-erp
goto MENU

:EXIT_SCRIPT
exit
