# @sifende/mcp

[![npm](https://img.shields.io/npm/v/@sifende/mcp)](https://www.npmjs.com/package/@sifende/mcp)
[![CI](https://github.com/ithdev/sifende-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ithdev/sifende-mcp/actions/workflows/ci.yml)
[![Licencia: Apache 2.0](https://img.shields.io/badge/licencia-Apache%202.0-blue)](LICENSE)

Servidor [MCP](https://modelcontextprotocol.io) oficial de Sifende. Conecta Claude, Cursor y otros clientes MCP a tu cuenta de Sifende para que puedas pedir en lenguaje natural lo que hoy hacés con la API: consultar documentos electrónicos de SIFEN, descargar el KuDE, buscar un RUC en el padrón y, si lo habilitás, emitir facturas, notas y eventos.

- Corre en tu máquina, por `stdio`, con tu propia API key. No hay servidor intermedio ni se envía nada a terceros.
- Arranca en solo lectura. Para emitir tenés que habilitarlo con una variable.
- Usa el [SDK oficial `@sifende/sdk`](https://github.com/ithdev/sifende-node), con los mismos reintentos seguros, idempotencia y cálculo de totales que la API.

## Primeros pasos

Necesitás Node.js 22.18 o superior y un cliente MCP. No hace falta instalar nada: el cliente ejecuta el servidor con `npx`.

### 1. Creá una API key de Sandbox

En el panel de Sifende, entrá a **API Keys → Crear API Key** y creá una de Sandbox: empieza con `sk_sandbox_` ([guía](https://www.sifende.com.py/docs/inicio-rapido/paso-1-credenciales)). Con ella podés emitir sin enviar nada a SIFEN.

### 2. Agregá el servidor a tu cliente

**Claude Code**

```bash
claude mcp add sifende --env SIFENDE_API_KEY=sk_sandbox_... -- npx -y @sifende/mcp
```

**Claude Desktop.** Abrí Configuración → Desarrollador → Editar configuración, agregá este bloque a `claude_desktop_config.json` y reiniciá Claude Desktop:

```json
{
  "mcpServers": {
    "sifende": {
      "command": "npx",
      "args": ["-y", "@sifende/mcp"],
      "env": {
        "SIFENDE_API_KEY": "sk_sandbox_..."
      }
    }
  }
}
```

**Cursor.** El mismo bloque va en `~/.cursor/mcp.json`, o en `.cursor/mcp.json` para un solo proyecto. También sirve para otros clientes con el formato `mcpServers` (Windsurf, Cline, Zed con su variante, etc.).

### 3. Probá una consulta

> ¿Con qué ambiente estás conectado y cuántos documentos me quedan en el plan?

El modelo llama a `informacion_servidor` y `consultar_consumo_plan`. Si responde "Sandbox", ya está funcionando.

### 4. Emití tu primera factura de prueba

Para que el modelo pueda emitir, agregá `SIFENDE_MCP_ALLOW_WRITE=true` al bloque `env` y reiniciá el cliente:

```json
"env": {
  "SIFENDE_API_KEY": "sk_sandbox_...",
  "SIFENDE_MCP_ALLOW_WRITE": "true"
}
```

En Claude Code, volvé a agregar el servidor con `--env SIFENDE_MCP_ALLOW_WRITE=true` (antes borralo con `claude mcp remove sifende`).

Después pedile:

> Emití una factura al contado por 2 remeras a 150.000 Gs y un envío de 25.000 Gs, IVA 10%, para Juan Pérez, cédula 1234567. Cuando esté aprobada, bajame el KuDE.

El modelo calcula el total con `calcular_totales`, revisa los valores válidos con `listar_enumeraciones`, emite, consulta el estado hasta que SIFEN lo aprueba y guarda el PDF. Tu cliente te va a pedir confirmación antes de emitir.

## Ambientes

El prefijo de la API key decide el ambiente. No hay otra URL ni otra configuración.

| Prefijo | Ambiente | Validez fiscal | Eventos (cancelar, inutilizar, nominar) |
|---|---|---|---|
| `sk_sandbox_` | Sandbox de Sifende. No se envía a SIFEN. | No | No. Las herramientas de eventos no aparecen. |
| `sk_test_` | Ambiente de pruebas de SIFEN. | No | Sí |
| `sk_live_` | Producción. | Sí | Sí |

Para probar eventos, usá una API key `sk_test_`. Para saber con qué ambiente está conectado el servidor, preguntale al modelo o llamá a `informacion_servidor`.

## Qué le podés pedir

Consultas (siempre disponibles):

> ¿En qué estado está el documento con CDC 01800123450010010000001...?
>
> Buscá el RUC 80012345 en el padrón y decime la razón social.
>
> Bajame el KuDE del documento 01800123450010010000001...
>
> ¿Qué códigos de unidad de medida acepta SIFEN?

Con la escritura habilitada:

> Cancelá la factura con CDC 01800123450010010000001..., el cliente la rechazó.
>
> Inutilizá las facturas 50 a 60 del timbrado 12345678, establecimiento 001, punto 001. Se saltaron por un error del sistema.
>
> Hacé una nota de crédito por la devolución de una de las remeras de la factura anterior.

## Antes de usar `sk_live_`

Con una API key `sk_live_`, cada emisión es un documento fiscal real a nombre de tu contribuyente.

- **Supervisá cada operación.** Un modelo puede equivocarse en un importe, un receptor o un tipo de documento. Un documento aprobado por SIFEN solo se deshace con una cancelación dentro de las 48 horas (facturas) o 168 horas (notas).
- **Revisá los datos antes de aceptar una herramienta de escritura.** Los clientes MCP piden confirmación por herramienta. No la desactives con `sk_live_`.
- **Dejá `SIFENDE_MCP_ALLOW_WRITE` apagado** cuando solo necesites consultar. Al arrancar con escritura habilitada y `sk_live_`, el servidor escribe una advertencia en stderr.
- **Tratá la API key como una contraseña.** Queda en texto plano en la configuración del cliente: no la subas a un repositorio.
- **Corré el servidor solo en tu máquina.** No lo expongas por red ni lo incluyas en una app que distribuyas.

## Referencia

### Variables de entorno

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SIFENDE_API_KEY` | | Obligatoria. Su prefijo define el [ambiente](#ambientes). |
| `SIFENDE_MCP_ALLOW_WRITE` | `false` | Con `true` o `1` aparecen las herramientas que emiten documentos y eventos. Acepta `true`, `1`, `false`, `0` o vacío; cualquier otro valor impide que el servidor arranque. |
| `SIFENDE_MCP_KUDE_DIR` | carpeta temporal del sistema | Carpeta donde `descargar_kude` guarda los PDF. |
| `SIFENDE_BASE_URL` | `https://api.sifende.com.py` | Solo para apuntar a otro host. |

### Herramientas de lectura

Siempre disponibles.

| Herramienta | Qué hace |
|---|---|
| `informacion_servidor` | Ambiente, versión y si la escritura está habilitada. No usa la red. |
| `consultar_documento` | Estado de un documento por CDC (`PENDIENTE`, `APROBADO`, `APROBADO_OBSERVACION`, `RECHAZADO`, `CANCELADO` o `ERROR`), con el protocolo de SIFEN y el motivo de rechazo. |
| `descargar_kude` | Guarda el KuDE (PDF) de un documento aprobado en un archivo local y devuelve la ruta. Opcionalmente lo incluye en base64. |
| `consultar_contribuyente` | RUC, razón social, ambiente y actividades del contribuyente de la API key. |
| `consultar_padron` | Busca un RUC o cédula en el padrón de la SET y devuelve los datos con los nombres de campo del receptor. |
| `consultar_consumo_plan` | Plan vigente y documentos incluidos, consumidos y disponibles. |
| `listar_enumeraciones` | Valores válidos de cada enumeración de la API: tipos de pago, unidades de medida, monedas, países, etc. |
| `consultar_geografia` | Departamentos, distritos y ciudades con sus códigos SIFEN. |
| `listar_eventos` / `consultar_evento` | Eventos registrados (cancelación, inutilización, nominación) y su estado ante SIFEN. |
| `calcular_totales` | Total de un documento con el redondeo oficial de la SET. Se calcula localmente, sin llamar a la API. |
| `obtener_ejemplo_documento` | Documentos de ejemplo con datos ficticios: factura al contado B2C y B2B, factura a crédito en cuotas, nota de crédito y nota de débito. |

### Herramientas de escritura

Solo aparecen con `SIFENDE_MCP_ALLOW_WRITE=true`. Con una API key `sk_sandbox_` aparece solo `emitir_documento`, porque Sandbox no admite eventos.

| Herramienta | Qué hace | Anotaciones |
|---|---|---|
| `emitir_documento` | Emite una factura, nota de crédito, nota de débito, nota de remisión o autofactura. Responde con el CDC en estado `PENDIENTE`. | `readOnlyHint: false`, `destructiveHint: false` |
| `cancelar_documento` | Cancela un documento aprobado (48 h para facturas, 168 h para notas). | `destructiveHint: true` |
| `inutilizar_numeracion` | Da de baja un rango de numeración sin usar. | `destructiveHint: true` |
| `nominar_documento` | Identifica al receptor de una factura emitida como innominada. | `destructiveHint: false` |

`emitir_documento` y `nominar_documento` no se marcan como destructivas porque solo agregan: no modifican ni borran lo que ya está registrado. Aun así no tienen vuelta atrás (un documento emitido solo se anula con una cancelación dentro del plazo), y con una API key `sk_live_` las cuatro descripciones le advierten al modelo que registran operaciones fiscales reales y que confirme los datos con el usuario.

### Recursos

| URI | Contenido |
|---|---|
| `sifende://guia/rapida` | Flujo de emisión, reglas del documento y eventos. |
| `sifende://docs/llms.txt` | Índice de la documentación, descargado de sifende.com.py. |
| `sifende://ejemplos/{nombre}` | Los mismos documentos de ejemplo de `obtener_ejemplo_documento`. |

### Errores

Los errores de la API (Problem Details, RFC 9457) le llegan al modelo como texto legible: el código, el detalle, cada campo inválido, los valores aceptados cuando falla una enumeración, el `traceId` para soporte y el enlace a la documentación del error.

Si se corta la conexión al emitir o registrar un evento, no se sabe si la operación se hizo. El mensaje incluye la `idempotencyKey` usada: si el modelo repite la llamada con esa misma `idempotencyKey`, recibe el resultado original y no se duplica el documento. `emitir_documento` y los eventos siempre devuelven la `idempotencyKey` que usaron.

## Desarrollo

```bash
git clone https://github.com/ithdev/sifende-mcp
cd sifende-mcp
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

Los tests levantan el servidor MCP en memoria y simulan la API con un `fetch` falso, sin llamadas de red.

### Probarlo con el Inspector

```bash
# Listar las herramientas
npx @modelcontextprotocol/inspector --cli -e SIFENDE_API_KEY=sk_sandbox_... node dist/index.mjs --method tools/list

# Llamar una herramienta
npx @modelcontextprotocol/inspector --cli -e SIFENDE_API_KEY=sk_sandbox_... node dist/index.mjs \
  --method tools/call --tool-name listar_enumeraciones --tool-arg nombre=tipoPago

# Interfaz web. El Inspector no hereda el entorno: pasá la API key en la interfaz o con -e.
SIFENDE_API_KEY=sk_sandbox_... npm run inspector
```

### Publicar una versión

Los pasos para publicar en npm y en el MCP Registry están en [RELEASING.md](RELEASING.md).

## Soporte

- Errores del servidor MCP: abrí un [issue](https://github.com/ithdev/sifende-mcp/issues).
- Vulnerabilidades: reportalas en privado, como explica [SECURITY.md](SECURITY.md).
- Tu cuenta, tus documentos o la API: escribinos a [soporte@sifende.com.py](mailto:soporte@sifende.com.py).

## Licencia

[Apache 2.0](LICENSE). Copyright 2026 ITH E.A.S.; ver [NOTICE](NOTICE).
