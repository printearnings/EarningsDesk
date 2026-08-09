@echo off
REM Launches the Next.js dev server with Node on PATH.
REM
REM Needed only because this machine had Node installed after the current
REM shell/editor session started, so the inherited PATH predates it. Once the
REM app is restarted, `npm run dev` works directly and this wrapper is
REM redundant (harmless to keep — it's also handy in CI-less environments).
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
npm run dev
