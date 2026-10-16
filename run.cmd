@echo off
REM Starts Man Friday. Double-click this file, or run "run.cmd" from any terminal.
REM Then open http://localhost:8082/  (login admin / admin123). Press Ctrl+C to stop.

cd /d "%~dp0backend"

where java >nul 2>nul || (echo [ERROR] Java is not on PATH. & pause & exit /b 1)

netstat -ano | findstr /R /C:":8082 .*LISTENING" >nul && (
  echo [ERROR] Port 8082 is already in use - Man Friday may already be running.
  echo         Open http://localhost:8082/ or close the other window first.
  pause & exit /b 1
)

netstat -ano | findstr /R /C:":3306 .*LISTENING" >nul || (
  echo [ERROR] MySQL is not running on port 3306. Start the MySQL80 service first.
  pause & exit /b 1
)

echo Starting Man Friday on http://localhost:8082/ ...
start "" cmd /c "timeout /t 25 >nul & start http://localhost:8082/"
call .\mvnw.cmd spring-boot:run
pause
