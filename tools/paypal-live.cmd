@echo off
setlocal
set "AMQ_LIVE_SETUP=%~dp0paypal-sandbox.mjs"
set "AMQ_SETUP_MODE=%~1"
echo AMQ Tours Live PayPal setup
echo This registers the Live product, monthly plan and webhook, and activates checkout on amqtours-gatcha.
echo Setup does not place an order or charge a customer.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; $node=(Get-Command node.exe -ErrorAction SilentlyContinue).Source; if (-not $node) { $pkg=Get-AppxPackage 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1; if ($pkg) { $node=Join-Path $pkg.InstallLocation 'dependencies/node/bin/node.exe' } }; if (-not $node -or -not (Test-Path -LiteralPath $node)) { throw 'Install Node.js 22.13 or newer and run this file again.' }; if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $env:AMQ_LIVE_SETUP) '../node_modules/wrangler/bin/wrangler.js'))) { throw 'Install the repository dependencies first.' }; if ($env:AMQ_SETUP_MODE -eq '--check') { & $node --check $env:AMQ_LIVE_SETUP; exit $LASTEXITCODE }; if (Test-Path -LiteralPath (Join-Path $env:APPDATA 'xdg.config/.wrangler/config/default.toml')) { if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.wrangler/config/default.toml'))) { $env:USERPROFILE=Join-Path $env:APPDATA 'xdg.config' } }; $env:PAYPAL_LIVE_CLIENT_ID=(Read-Host 'PayPal Live Client ID').Trim(); $secret=Read-Host 'PayPal Live Secret (input hidden)' -AsSecureString; $env:PAYPAL_LIVE_CLIENT_SECRET=[System.Net.NetworkCredential]::new('', $secret).Password.Trim(); & $node $env:AMQ_LIVE_SETUP --live --configure-worker; exit $LASTEXITCODE"
set "AMQ_EXIT=%ERRORLEVEL%"
if /i not "%~1"=="--check" pause
exit /b %AMQ_EXIT%
