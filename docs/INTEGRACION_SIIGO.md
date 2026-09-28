# Integración con Siigo Pyme

## Sistema de Gestión de Inventarios
### Banco Arquidiocesano de Alimentos de Ibagué

---

## 1. PRINCIPIOS FUNDAMENTALES

### 1.1 NO reemplazar Siigo Pyme
El sistema es una solución **complementaria** especializada en gestión de inventarios. Siigo Pyme sigue siendo el sistema contable/administrativo principal.

### 1.2 NO inventar información
Cualquier característica de Siigo Pyme que no esté confirmada debe marcarse como **PENDIENTE DE VALIDACIÓN**.

### 1.3 Abstracción configurable
Toda la lógica de integración debe estar aislada en un servicio independiente (`SiigoIntegrationService`) que permita modificarla sin afectar el resto del sistema.

---

## 2. ESTADO ACTUAL

| Componente | Estado | Descripción |
|---|---|---|
| SiigoIntegrationService | **DEMO** | Interfaz simulada, no conecta con Siigo real |
| Exportar a Excel | **DEMO** | Genera archivo Excel compatible (estructura pendiente) |
| Importar desde Excel | **DEMO** | Lee archivo Excel (estructura pendiente) |
| PUSH a Siigo | **PENDIENTE** | Requiere plantilla y comando validado |
| GET desde Siigo | **PENDIENTE** | Requiere plantilla y comando validado |
| Componente local/puente | **PENDIENTE** | Requiere acceso al equipo del Banco |

---

## 3. ARQUITECTURA DE INTEGRACIÓN

### 3.1 Diagrama

```
┌─────────────────────────────────────────────────────────┐
│                    NUBE                                  │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────┐    │
│  │  Vercel     │    │  Supabase PostgreSQL         │    │
│  │  Next.js    │◄──►│  Base de datos               │    │
│  └──────┬──────┘    └──────────────────────────────┘    │
│         │                                                │
│  ┌──────▼──────────────────────────────────────────┐    │
│  │  SiigoIntegrationService (DEMO)                  │    │
│  │                                                  │    │
│  │  • exportToExcel() → Archivo Excel              │    │
│  │  • importFromExcel() ← Archivo Excel            │    │
│  │  • validateTemplate() → Validación              │    │
│  │  • pushToSiigo() → [PENDIENTE]                  │    │
│  │  • getFromSiigo() → [PENDIENTE]                 │    │
│  └──────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │ [FUTURO: API segura]
┌────────────────────────▼────────────────────────────────┐
│              EQUIPO AUTORIZADO DEL BANCO                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Componente local / puente                        │   │
│  │                                                  │   │
│  │  • Recibe archivo Excel                          │   │
│  │  • Ejecuta ExcelSiigo (GET/PUSH)                 │   │
│  │  • Devuelve resultado                            │   │
│  └──────────────────────────────────────────────────┘   │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  ExcelSiigo                                     │    │
│  │  • GET → Extraer información de Siigo Pyme      │    │
│  │  • PUSH → Importar información a Siigo Pyme     │    │
│  └──────────────────────────────────────────────────┘   │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  Siigo Pyme (instalado localmente)              │    │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de Exportación (PUSH)
```
Usuario → Selecciona datos → API /api/siigo/export
  → SiigoIntegrationService.exportToExcel()
  → Genera archivo Excel con estructura de plantilla
  → Usuario descarga archivo
  → [FUTURO] Usuario sube archivo a componente local
  → [FUTURO] Componente local ejecuta ExcelSiigo PUSH
  → [FUTURO] Datos importados a Siigo Pyme
```

### 3.3 Flujo de Importación (GET)
```
[FUTURO] Usuario solicita datos → API /api/siigo/import
  → [FUTURO] Componente local ejecuta ExcelSiigo GET
  → [FUTURO] ExcelSiigo extrae datos de Siigo Pyme
  → [FUTURO] Genera archivo Excel
  → [FUTURO] Archivo subido a la aplicación
  → SiigoIntegrationService.importFromExcel()
  → Validación de estructura
  → Importación a base de datos
  → Resultado al usuario
```

---

## 4. EXCELSIIGO — REFERENCIA

### 4.1 ¿Qué es ExcelSiigo?
ExcelSiigo es un mecanismo de Siigo que permite intercambiar información entre Siigo Pyme y archivos Excel.

### 4.2 Operaciones

| Operación | Dirección | Descripción |
|---|---|---|
| **GET** | Siigo Pyme → Excel | Extraer información de Siigo Pyme a un archivo Excel |
| **PUSH** | Excel → Siigo Pyme | Importar información desde un archivo Excel a Siigo Pyme |

### 4.3 Plantillas
- Las plantillas generadas para determinados procesos tienen **columnas y estructuras específicas**
- **NO se deben modificar** los nombres de columnas cuando Siigo requiera una plantilla específica
- Cada operación (GET/PUSH) puede tener su propia plantilla

### 4.4 Comandos
- **NO inventar comandos**
- Los comandos específicos deben obtenerse de la documentación oficial de Siigo
- Cada proceso puede requerir comandos diferentes

---

## 5. FORMATOS IDENTIFICADOS

### 5.1 Entradas
| Formato | Significado | Estado |
|---|---|---|
| E1 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| E3 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| N3 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| N5 | **PENDIENTE DE VALIDACIÓN** | No confirmado |

### 5.2 Facturas
| Formato | Significado | Estado |
|---|---|---|
| SF1 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| F2 | **PENDIENTE DE VALIDACIÓN** | No confirmado |

### 5.3 Recibos
| Formato | Significado | Estado |
|---|---|---|
| R1 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| R2 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| R3 | **PENDIENTE DE VALIDACIÓN** | No confirmado |
| R4 | **PENDIENTE DE VALIDACIÓN** | No confirmado |

### 5.4 Relaciones entre formatos
- Relación R1/R2/R3/R4 con SF1/F2: **PENDIENTE DE VALIDACIÓN**
- No asumir relaciones definitivas hasta confirmación

---

## 6. BODEGAS VIRTUALES

### 6.1 Bodegas identificadas
| Código | Nombre | Estado |
|---|---|---|
| 1.1 | Productos propios | **CONFIGURABLE** — puede cambiar |

### 6.2 Nota importante
- Los nombres definitivos de las bodegas **NO han sido confirmados**
- El sistema permite configurar 6-8 bodegas sin modificar código
- Tratar "1.1 – productos propios" como configuración inicial, no definitiva

---

## 7. OPERACIONES PUSH — REQUISITOS

Antes de ejecutar cualquier operación PUSH real, se requiere:

| # | Requisito | Estado |
|---|---|---|
| 1 | Plantilla correcta del proceso específico | **PENDIENTE** |
| 2 | Comando validado con Siigo Pyme | **PENDIENTE** |
| 3 | Entorno autorizado del Banco | **PENDIENTE** |
| 4 | Copia de seguridad / backup | **PENDIENTE** |
| 5 | Prueba controlada con datos de prueba | **PENDIENTE** |
| 6 | Confirmación del usuario | **PENDIENTE** |

### 7.1 Flujo obligatorio para PUSH
```
1. Validación de datos
2. Vista previa de lo que se va a importar
3. Confirmación explícita del usuario
4. Ejecución de la operación
5. Registro de la operación en audit_logs
6. Manejo de errores
7. Registro del resultado
```

---

## 8. LIMITACIONES DE LA APLICACIÓN WEB

### 8.1 NO se puede ejecutar ExcelSiigo desde la nube
- ExcelSiigo es un componente **local** de Windows
- Requiere Siigo Pyme instalado en el mismo equipo
- La aplicación en Vercel/Supabase **NO** puede ejecutar un `.exe` de Windows

### 8.2 Solución: Componente local/puente
- Se requiere un componente local en el equipo autorizado del Banco
- Este componente actúa como puente entre la nube y Siigo Pyme
- La comunicación debe ser segura (HTTPS, autenticación)

### 8.3 Para el MVP
- La integración se **SIMULA** (estado DEMO)
- No se finge que la integración real funciona
- Las interfaces de importar/exportar/validar están preparadas

---

## 9. INFORMACIÓN REQUERIDA PARA IMPLEMENTACIÓN REAL

| # | Información | Para qué | Estado |
|---|---|---|---|
| 1 | Plantillas ExcelSiigo (GET) | Importar datos desde Siigo | **PENDIENTE** |
| 2 | Plantillas ExcelSiigo (PUSH) | Exportar datos a Siigo | **PENDIENTE** |
| 3 | Comandos específicos por proceso | Ejecutar operaciones | **PENDIENTE** |
| 4 | Estructura de columnas de cada plantilla | Validar archivos | **PENDIENTE** |
| 5 | Significado de formatos E1/E3/N3/N5 | Configurar formularios | **PENDIENTE** |
| 6 | Diferencia SF1/F2 | Configurar facturas | **PENDIENTE** |
| 7 | Relación R1-R4 con SF1/F2 | Configurar recibos | **PENDIENTE** |
| 8 | Nombres definitivos de bodegas | Configurar catálogo | **PENDIENTE** |
| 9 | Formato físico de soportes | Diseño de documentos | **PENDIENTE** |
| 10 | Acceso al entorno Siigo Pyme | Pruebas reales | **PENDIENTE** |

---

## 10. DECISIONES DE DISEÑO

| Decisión | Justificación |
|---|---|
| Módulo independiente (SiigoIntegrationService) | No mezclar lógica de Siigo con el resto |
| Estado DEMO en el MVP | No fingir que la integración real funciona |
| Interfaces preparadas para importar/exportar | Permitir implementación real futura |
| No usar API de Siigo Nube | Es un producto diferente a Siigo Pyme |
| No asumir API REST de Siigo Pyme | No confirmada en la documentación |

---

## 11. PRÓXIMOS PASOS

1. **FASE 8**: Crear interfaz DEMO de integración Siigo
2. **Validación**: Obtener plantillas y comandos de Siigo
3. **Desarrollo**: Implementar componente local/puente
4. **Pruebas**: Validar con entorno real del Banco
5. **Producción**: Activar integración REAL

---

*Documento actualizado en FASE 1 — Arquitectura + Scaffold*
