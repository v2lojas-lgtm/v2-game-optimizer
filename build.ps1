# V2 Game Optimizer — Full build script
# Usage: .\build.ps1
# Produces: dist/V2 Game Optimizer Setup <version>.exe

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "    ERRO: $msg" -ForegroundColor Red; exit 1 }

# ── 1. Check tools ─────────────────────────────────────────────────────────────
Step "Verificando ferramentas"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Fail "Python não encontrado no PATH" }
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
    Write-Host "    PyInstaller não encontrado. Instalando..." -ForegroundColor Yellow
    python -m pip install pyinstaller --quiet
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm não encontrado no PATH" }
Ok "Ferramentas OK"

# ── 2. Install Python dependencies ─────────────────────────────────────────────
Step "Instalando dependências Python"
python -m pip install -r python/requirements.txt --quiet
Ok "pip install OK"

# ── 3. Bundle Python sidecar with PyInstaller ──────────────────────────────────
Step "Empacotando sidecar Python (PyInstaller)"
if (Test-Path "python/dist/sidecar.exe") {
    Remove-Item "python/dist/sidecar.exe" -Force
}
pyinstaller python/sidecar.spec --distpath python/dist --workpath python/build --noconfirm
if (-not (Test-Path "python/dist/sidecar.exe")) { Fail "sidecar.exe não foi gerado" }
$size = [math]::Round((Get-Item "python/dist/sidecar.exe").Length / 1MB, 1)
Ok "sidecar.exe gerado (${size} MB)"

# ── 4. Install Node dependencies ───────────────────────────────────────────────
Step "Instalando dependências Node"
npm install --silent
Ok "npm install OK"

# ── 5. Build Electron app ──────────────────────────────────────────────────────
Step "Build do Electron (electron-vite)"
npm run build
Ok "Build OK"

# ── 6. Package with electron-builder ──────────────────────────────────────────
Step "Gerando instalador (electron-builder)"
npx electron-builder --win
Ok "Instalador gerado"

# ── 7. Report ─────────────────────────────────────────────────────────────────
Step "Resultado"
$installers = Get-ChildItem "dist-installer" -Filter "*.exe" -ErrorAction SilentlyContinue
if ($installers) {
    foreach ($f in $installers) {
        $mb = [math]::Round($f.Length / 1MB, 1)
        Write-Host "    $($f.Name)  (${mb} MB)" -ForegroundColor White
    }
} else {
    Write-Host "    Nenhum instalador encontrado em dist/" -ForegroundColor Yellow
}

Write-Host "`nBuild concluido!" -ForegroundColor Green
