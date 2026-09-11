@echo off
title Modular Mobile ERP (Desktop-First)
echo ======================================================================
echo    STARTING MODULAR MOBILE ERP (DESKTOP APPLICATION)
echo    Lab Repairs • Retail POS • Spare Parts Wholesale • Fintech E-Wallets
echo ======================================================================

start "ERP Backend Server" cmd /k "cd server && npx tsx src/index.ts"
timeout /t 2 /nobreak >nul
start "ERP Desktop UI" cmd /k "cd client && npm run dev"

echo Opening ERP in your browser at http://localhost:3000...
timeout /t 2 /nobreak >nul
start http://localhost:3000
