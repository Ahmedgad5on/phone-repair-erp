@echo off
chcp 65001 > nul
echo ===================================================
echo        رفع التحديثات تلقائياً إلى GitHub
echo ===================================================
echo.
git status --short
echo.
set /p msg="اكتب وصف التحديث (أو اضغط Enter لرسالة تلقائية): "
if "%msg%"=="" (
    set msg=تحديث تلقائي: %date% %time%
)

git add .
git commit -m "%msg%"
echo.
echo جارٍ الرفع إلى GitHub...
git push origin main
echo.
echo ===================================================
echo  تمت المزامنة والرفع بنجاح إلى GitHub!
echo ===================================================
pause
