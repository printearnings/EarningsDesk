@echo off
REM Launches `wrangler dev` (the Worker + static assets, matching production)
REM with Node on PATH. See web\dev.cmd for why the PATH fixup is needed.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
npm run dev
