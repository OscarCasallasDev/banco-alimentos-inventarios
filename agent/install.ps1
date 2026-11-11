<#
  Registra la Tarea Programada de Windows que ejecuta la sincronización
  con Siigo Pyme cada hora.

  Uso (desde la carpeta del agente, con permisos de administrador):
    powershell -ExecutionPolicy Bypass -File install.ps1

  Opciones:
    -ApiUrl      URL del sistema (por defecto, la de config.json)
    -ConfigPath  Ruta del config.json
    -TaskName    Nombre de la tarea
#>

param(
  [string]$TaskName = "Banco de Alimentos - Sincronizacion Siigo",
  [string]$ConfigPath = "$PSScriptRoot\config.json",
  [string]$NodeExe = "node"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Registro de la tarea programada: $TaskName ===" -ForegroundColor Cyan

# --- Node.js ---
$nodePath = (Get-Command $NodeExe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  Write-Host "No se encontro Node.js en el PATH. Instale Node.js 20 o superior." -ForegroundColor Red
  exit 1
}
Write-Host "Node.js: $nodePath"

# --- Configuración ---
if (-not (Test-Path $ConfigPath)) {
  Write-Host "No se encontro el archivo de configuracion: $ConfigPath" -ForegroundColor Red
  Write-Host "Copie config.example.json como config.json y complete los datos." -ForegroundColor Yellow
  exit 1
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($config.apiKey)) {
  Write-Host "La clave del agente (apiKey) esta vacia." -ForegroundColor Red
  Write-Host "Genere una clave en Integracion Siigo -> Agente local y copiela en config.json." -ForegroundColor Yellow
  exit 1
}

# --- tsx ---
$tsxPath = Join-Path $PSScriptRoot "node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsxPath)) {
  Write-Host "Faltan las dependencias. Ejecute: npm install" -ForegroundColor Yellow
  exit 1
}

$entryPoint = Join-Path $PSScriptRoot "src\index.ts"
$taskCommand = "`"$nodePath`" `"$tsxPath`" `"$entryPoint`""

# --- Tarea ---
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "La tarea ya existe; se va a reemplazar." -ForegroundColor Yellow
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$tsxPath`" `"$entryPoint`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Sincroniza el inventario de Siigo Pyme con el sistema del Banco" | Out-Null

Write-Host ""
Write-Host "Tarea registrada: $TaskName" -ForegroundColor Green
Write-Host "Se ejecuta cada hora. Para probarla ahora:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para quitarla:" -ForegroundColor Cyan
Write-Host "  Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false" -ForegroundColor Cyan
