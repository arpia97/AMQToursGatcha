@echo off
setlocal
set "AMQ_PAYPAL_NODE=C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe"
set "AMQ_PAYPAL_SETUP_PATH=%~dp0paypal-sandbox.mjs"
if /i "%~1"=="--test-checkout" (
  set "AMQ_PAYPAL_SETUP_PATH=%~dp0paypal-checkout-test.mjs"
  set "AMQ_PAYPAL_TEST_ORIGIN=%~2"
)

if not exist "%AMQ_PAYPAL_NODE%" (
  echo The Codex Node.js runtime was moved. Close this prompt and ask Codex to refresh the launcher.
  exit /b 1
)
if not exist "%AMQ_PAYPAL_SETUP_PATH%" (
  echo The PayPal sandbox setup file is missing.
  exit /b 1
)
if /i "%~1"=="--check" (
  "%AMQ_PAYPAL_NODE%" --version
  exit /b
)
"%AMQ_PAYPAL_NODE%" --version >nul
if errorlevel 1 exit /b 1
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference = 'Stop'; $env:PAYPAL_SANDBOX_CLIENT_ID = (Read-Host 'Sandbox client ID').Trim(); $secret = Read-Host 'Replacement Sandbox client secret' -AsSecureString; $env:PAYPAL_SANDBOX_CLIENT_SECRET = [System.Net.NetworkCredential]::new('', $secret).Password.Trim(); & $env:AMQ_PAYPAL_NODE $env:AMQ_PAYPAL_SETUP_PATH $env:AMQ_PAYPAL_TEST_ORIGIN; exit $LASTEXITCODE"
exit /b %ERRORLEVEL%
