# Agente local de sincronización con Siigo Pyme

## ¿Qué es?

Un programa pequeño que se instala en el computador del Banco donde está
Siigo Pyme. Cada hora toma el reporte de inventario generado por Siigo y lo
envía al sistema web para que el almacenista vea las existencias actualizadas.

## ¿Por qué hace falta?

Siigo Pyme es una aplicación de escritorio: el reporte se genera en ese
equipo. La aplicación web está en la nube y **no puede leer las carpetas del
computador del Banco**. El agente es el puente.

El agente **no ejecuta ExcelSiigo ni escribe en Siigo Pyme**: sólo lee el
archivo que el procedimiento autorizado del Banco deja en la carpeta de
intercambio.

## Instalación

### 1. Preparar la carpeta de intercambio

El Banco debe dejar el reporte "Movimiento detallado de bodega por fecha"
(`.xlsx`) en una carpeta conocida, por ejemplo:

```
C:\BancoAlimentos\Siigo\Salidas\
```

### 2. Instalar Node.js 20 o superior en el equipo

### 3. Copiar el agente

Copie la carpeta `agent/` del proyecto a, por ejemplo:

```
C:\BancoAlimentos\agente\
```

### 4. Configurar

Duplique `config.example.json` como `config.json` y complete:

| Campo | Qué poner |
|---|---|
| `apiUrl` | La dirección del sistema, p.ej. `https://inventarios.banco.org` |
| `apiKey` | La clave que genera el administrador en **Integración Siigo → Agente local** |
| `watchFolder` | La carpeta de intercambio |
| `agentId` | Un nombre que identifique el equipo |
| `batchSize` | Filas por petición (10.000 va bien) |
| `maxAgeMinutes` | Antigüedad máxima del archivo para considerarlo nuevo (90) |
| `force` | `true` solo para reprocesar un archivo ya importado |

### 5. Instalar dependencias

```powershell
cd C:\BancoAlimentos\agente
npm install
```

### 6. Probar manualmente

```powershell
npm start
```

Debe aparecer en la consola y en `logs\sincronizacion.log` el resultado del
ciclo. Si no hay archivo nuevo, lo dirá: es el comportamiento correcto.

### 7. Programar la tarea cada hora

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

O manualmente:

```powershell
schtasks /create /tn "Banco de Alimentos - Sincronizacion Siigo" `
  /tr "\"C:\Program Files\nodejs\node.exe\" \"C:\BancoAlimentos\agente\node_modules\tsx\dist\cli.mjs\" \"C:\BancoAlimentos\agente\src\index.ts\"" `
  /sc hourly /mo 1 /rl highest
```

## Cómo se comporta

| Situación | Qué hace |
|---|---|
| No hay archivo nuevo | Registra "no hay reportes nuevos" y termina. |
| El archivo ya fue importado | No lo reprocesa (la identidad es el SHA-256 del archivo). |
| El archivo es inválido | La importación falla, el inventario anterior **no** se toca y queda registrado. |
| Hay filas que no cumplen las reglas | Se rechazan con su motivo; el resto se procesa. |
| La red se cae | Se registra el error y el agente sale con código 1 (la tarea lo reintentará en la próxima hora). |

## Registro (log)

Todo queda en `logs\sincronizacion.log`:

```
[2026-11-09T14:00:03.120Z] INFO  === Iniciando sincronización con Siigo Pyme ===
[2026-11-09T14:00:03.121Z] INFO  Backend: https://inventarios.banco.org
[2026-11-09T14:00:04.002Z] INFO  Reporte detectado: Reporte detallado de inventarios x bodega - ...xlsx
[2026-11-09T14:00:04.580Z] INFO  SHA-256: dd88f4520f23593...
[2026-11-09T14:00:09.110Z] INFO  Reporte interpretado en 5120 ms: 65832 filas de movimiento (5528 de apertura), 10122 subtotales excluidos.
[2026-11-09T14:00:12.004Z] INFO  Lote 0: 10000 filas enviadas (10000 admitidas, 0 rechazadas).
...
[2026-11-09T14:01:45.220Z] INFO  Importación finalizada: COMPLETED, 65831 filas procesadas.
```

## Revocar el acceso

Si se pierde el equipo o se sospecha un uso indebido: **Integración Siigo →
Agente local → Revocar**. La clave deja de servir de inmediato, sin tocar el
sistema.
