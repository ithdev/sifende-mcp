# @sifende/mcp

Servidor [MCP](https://modelcontextprotocol.io) oficial de Sifende. Le da a Claude, Cursor y otros clientes MCP acceso a tu cuenta de Sifende para consultar documentos electrónicos de SIFEN, descargar el KuDE, buscar RUC en el padrón y, si lo habilitás, emitir facturas, notas y eventos.

- Corre en tu máquina, por `stdio`, con tu propia API key. No hay servidor intermedio ni se envía nada a terceros.
- Solo lectura por defecto. Emitir y registrar eventos se habilita con una variable explícita.
- Construido sobre el [SDK oficial `@sifende/sdk`](https://github.com/ithdev/sifende-node): mismos reintentos seguros, idempotencia y cálculo de totales que la API.

> La API key emite documentos a nombre de tu contribuyente. Con una clave `sk_live_` cada emisión es un documento fiscal real. Empezá con una clave `sk_sandbox_` o `sk_test_`.

## Requisitos

- Node.js 22.18 o superior.
- Una API key de Sifende: en el panel, **API Keys → Crear API Key** ([guía](https://www.sifende.com.py/docs/inicio-rapido/paso-1-credenciales)).

## Instalación

No hay nada que instalar: los clientes MCP lo ejecutan con `npx`.

### Claude Desktop

Editá `claude_desktop_config.json` (Configuración → Desarrollador → Editar configuración):

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

### Claude Code

```bash
claude mcp add sifende --env SIFENDE_API_KEY=sk_sandbox_... -- npx -y @sifende/mcp
```

### Cursor

En `~/.cursor/mcp.json` (o `.cursor/mcp.json` dentro de un proyecto):

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

El mismo bloque sirve para otros clientes que usan el formato `mcpServers` (Windsurf, Cline, Zed con su variante, etc.).

## Variables de entorno

| Variable | Por defecto | |
|---|---|---|
| `SIFENDE_API_KEY` | | Obligatoria. El prefijo fija el ambiente: `sk_sandbox_` (Sandbox, sin envío a SIFEN), `sk_test_` (pruebas con SIFEN) o `sk_live_` (producción). |
| `SIFENDE_MCP_ALLOW_WRITE` | `false` | Con `true` se registran las herramientas que emiten documentos y eventos. Cualquier otro valor distinto de `true`, `1`, `false`, `0` o vacío es un error. |
| `SIFENDE_BASE_URL` | `https://api.sifende.com.py` | Solo para apuntar a otro host. |
| `SIFENDE_MCP_KUDE_DIR` | carpeta temporal del sistema | Dónde guarda `descargar_kude` los PDF. |

**Ambientes.** Sifende no tiene una URL distinta para pruebas: la API key decide el ambiente. Para trabajar en pruebas usá una clave `sk_sandbox_` o `sk_test_`; el servidor no necesita otra configuración. La herramienta `informacion_servidor` informa con qué ambiente está conectado, y al arrancar se escribe en stderr una advertencia si la escritura está habilitada con una clave `sk_live_`.

## Herramientas

### Lectura (siempre disponibles)

| Herramienta | Qué hace |
|---|---|
| `informacion_servidor` | Ambiente, versión y si la escritura está habilitada. No usa la red. |
| `consultar_documento` | Estado de un documento por CDC: `PENDIENTE`, `APROBADO`, `APROBADO_OBSERVACION`, `RECHAZADO`, `CANCELADO` o `ERROR`, con protocolo de SIFEN y motivo de rechazo. |
| `descargar_kude` | Descarga el KuDE (PDF) de un documento aprobado, lo guarda en un archivo y devuelve la ruta. Opcionalmente lo incluye en base64. Escribe un archivo local. |
| `consultar_contribuyente` | RUC, razón social, ambiente y actividades del contribuyente de la API key. |
| `consultar_padron` | Busca un RUC o cédula en el padrón de la SET, con los nombres de campo del receptor. |
| `consultar_consumo_plan` | Plan vigente, documentos incluidos, consumidos y disponibles. |
| `listar_enumeraciones` | Valores válidos de cada enumeración de la API (`/api/v1/public/enums`): tipos de pago, unidades de medida, monedas, países, etc. |
| `consultar_geografia` | Departamentos, distritos y ciudades con sus códigos SIFEN. |
| `listar_eventos` / `consultar_evento` | Eventos registrados (cancelación, inutilización, nominación) y su estado ante SIFEN. |
| `calcular_totales` | Total de un documento con el redondeo oficial de la SET. Cálculo local, no llama a la API. |
| `obtener_ejemplo_documento` | Documento de ejemplo con datos ficticios: factura al contado B2C y B2B, factura a crédito en cuotas, nota de crédito y de débito. |

### Escritura (solo con `SIFENDE_MCP_ALLOW_WRITE=true`)

Sin la variable, estas herramientas ni siquiera aparecen en la lista.

| Herramienta | Qué hace | Anotaciones |
|---|---|---|
| `emitir_documento` | Emite factura, nota de crédito, de débito, de remisión o autofactura. Responde con el CDC en estado `PENDIENTE`. | `readOnlyHint: false`, `destructiveHint: false` |
| `cancelar_documento` | Cancela un documento aprobado (48 h para facturas, 168 h para notas). | `destructiveHint: true` |
| `inutilizar_numeracion` | Da de baja un rango de numeración sin usar. | `destructiveHint: true` |
| `nominar_documento` | Identifica al receptor de una factura emitida como innominada. | `destructiveHint: false` |

`emitir_documento` y `nominar_documento` solo agregan: no modifican ni borran lo ya registrado, por eso no se marcan como destructivas. Aun así son irreversibles en la práctica (un documento emitido solo se anula con una cancelación dentro del plazo), y las cuatro descripciones advierten que registran documentos fiscales reales.

Con `sk_sandbox_` los eventos (cancelar, inutilizar, nominar) no están soportados: la API responde `sandbox-operation-not-supported`.

### Recursos

| URI | Contenido |
|---|---|
| `sifende://guia/rapida` | Flujo de emisión y reglas que más fallan. |
| `sifende://docs/llms.txt` | Índice de la documentación, descargado de sifende.com.py. |
| `sifende://ejemplos/{nombre}` | Los mismos documentos de ejemplo de `obtener_ejemplo_documento`. |

## Ejemplos de uso

Con una clave `sk_sandbox_` y la escritura habilitada:

> Emití una factura al contado por 2 remeras a 150.000 Gs y un envío de 25.000 Gs, IVA 10%, para Juan Pérez, cédula 1234567. Cuando esté aprobada, bajame el KuDE.

El modelo calcula el total con `calcular_totales`, verifica enumeraciones con `listar_enumeraciones`, emite, consulta el estado hasta que se aprueba y guarda el PDF.

Solo lectura:

> ¿Cuántos documentos me quedan en el plan este mes?
>
> Buscá el RUC 80012345 en el padrón y decime la razón social.

## Errores

Los errores de la API (Problem Details, RFC 9457) vuelven al modelo en texto legible: el código, el detalle, cada campo inválido, los valores aceptados cuando el error es de enumeración, el `traceId` para soporte y el enlace a la documentación del error.

Si se corta la conexión al emitir o registrar un evento, el resultado es incierto. El mensaje incluye la `idempotencyKey` usada: repetir la llamada con la misma clave devuelve el resultado original sin duplicar el documento. `emitir_documento` y los eventos devuelven siempre la clave que usaron.

## Advertencias

- **No lo uses con `sk_live_` sin supervisar.** Un modelo puede equivocarse en un importe, un receptor o un tipo de documento, y un documento aprobado por SIFEN solo se deshace con una cancelación dentro de las 48 horas (facturas) o 168 horas (notas).
- Mantené `SIFENDE_MCP_ALLOW_WRITE` apagado cuando solo necesites consultar.
- Revisá siempre los datos antes de aceptar la ejecución de una herramienta de escritura. Los clientes MCP piden confirmación por herramienta; no la desactives para `sk_live_`.
- La API key vive en la configuración del cliente MCP, en texto plano. Tratala como una contraseña y no la subas a un repositorio.
- El servidor está pensado para correr en tu máquina. No lo expongas por red ni lo embebas en una app distribuida.

## Probarlo localmente

```bash
git clone https://github.com/ithdev/sifende-mcp
cd sifende-mcp
npm ci
npm run build

# Listar las herramientas con el Inspector en modo CLI
npx @modelcontextprotocol/inspector --cli -e SIFENDE_API_KEY=sk_sandbox_... node dist/index.mjs --method tools/list

# Llamar una herramienta
npx @modelcontextprotocol/inspector --cli -e SIFENDE_API_KEY=sk_sandbox_... node dist/index.mjs \
  --method tools/call --tool-name listar_enumeraciones --tool-arg nombre=tipoPago

# Inspector con interfaz web (el Inspector no hereda el entorno: pasá la clave en la interfaz o con -e)
SIFENDE_API_KEY=sk_sandbox_... npm run inspector
```

## Desarrollo

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

Los tests usan el servidor MCP en memoria y simulan la API con un `fetch` falso: no hacen llamadas de red.

## Publicación en el MCP Registry

`server.json` está listo para el [Registry oficial](https://registry.modelcontextprotocol.io). El `name` de `server.json` tiene que ser igual al `mcpName` de `package.json`, y el paquete tiene que estar publicado en npm antes de publicar en el Registry.

El nombre es `py.com.sifende/mcp` (la reversa de `sifende.com.py`) y se verifica por DNS: un registro TXT en el apex de `sifende.com.py` con la clave pública (`v=MCPv1; k=ed25519; p=...`).

```bash
mcp-publisher validate
mcp-publisher login dns --domain sifende.com.py --private-key "$MCP_PRIVATE_KEY"
mcp-publisher publish
```

## Licencia

[Apache 2.0](LICENSE). Copyright 2026 ITH E.A.S.; ver [NOTICE](NOTICE).
