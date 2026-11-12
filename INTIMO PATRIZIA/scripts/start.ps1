$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteEntry)) {
    throw 'Dipendenze mancanti. Eseguire npm ci nella cartella del progetto.'
}
Push-Location -LiteralPath $projectRoot
try { & node $viteEntry --host 127.0.0.1 --port 5173 }
finally { Pop-Location }
