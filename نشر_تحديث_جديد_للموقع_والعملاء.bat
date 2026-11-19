@echo off
chcp 65001 > nul
title ThermalLabPro - أداة أتمتة نشر التحديثات السحابية للعملاء
color 0A

cls
echo ===============================================================================
echo       ThermalLabPro Cloud Auto-Updater - أداة نشر التحديثات للعملاء والموقع
echo ===============================================================================
echo.
echo هذه الأداة تقوم بالآتي بضغطة زر واحدة:
echo  1. بناء حزمة التثبيت الرسمية (Setup.exe) بعد أي تعديل كود.
echo  2. ترقية رقم الإصدار تلقائياً وإضافة ملاحظات التحديث.
echo  3. تحديث ملفات الموقع السحابي وصفحة التحميل المباشر.
echo  4. رفع التحديث لخوادم التوزيع المباشر (GitHub CDN ^& Pages).
echo  5. إرسال إشعار فوري لجميع أجهزة العملاء لترقية البرنامج ذاتياً!
echo.
echo ===============================================================================
echo.

cd /d "%~dp0"

set /p ver=" أدخل رقم الإصدار الجديد (اضغط Enter للترقية التلقائية): "
set /p notes=" اكتب وصف وملاحظات التحديث للعملاء (اضغط Enter للوصف الافتراضي): "

echo.
echo جاري بدء عملية البناء والنشر المؤتمتة بالكامل...
echo.

if "%ver%"=="" (
    if "%notes%"=="" (
        "C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" scripts\publish_release.py
    ) else (
        "C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" scripts\publish_release.py --notes "%notes%"
    )
) else (
    if "%notes%"=="" (
        "C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" scripts\publish_release.py --version "%ver%"
    ) else (
        "C:\Users\Eng_Ahmed\AppData\Local\Programs\Python\Python312\python.exe" scripts\publish_release.py --version "%ver%" --notes "%notes%"
    )
)

echo.
echo اضغط أي مفتاح للعودة...
pause > nul
