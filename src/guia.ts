import {
  ESTADOS_TERMINALES,
  PLAZOS_CANCELACION,
  REGLA_ENUMERACIONES,
  REGLA_MONTOS,
  REGLA_NOTAS,
  REGLA_RECEPTOR,
} from './reglas.js';

/** Las reglas salen de reglas.ts: la guía es una vista de lo que ya dicen las herramientas, no otra fuente. */
export const GUIA_RAPIDA = `# Guía rápida de Sifende para agentes

Sifende es una API de facturación electrónica para SIFEN (Paraguay). Este servidor MCP usa la API key del contribuyente.

## Ambiente
El prefijo de la API key fija el ambiente: \`sk_sandbox_\` (Sandbox de Sifende, sin envío a SIFEN ni eventos), \`sk_test_\` (pruebas con SIFEN) y \`sk_live_\` (producción, con validez fiscal). \`informacion_servidor\` dice cuál es.

## Flujo de emisión
1. Armá el documento a partir de \`obtener_ejemplo_documento\`. ${REGLA_ENUMERACIONES}
2. En una venta al contado, \`montoPago\` es el \`totalGeneral\` de \`calcular_totales\`.
3. \`emitir_documento\` responde enseguida con el CDC en estado \`PENDIENTE\` y la \`idempotencyKey\` usada.
4. Seguí con \`consultar_documento\` cada 5 segundos, por un máximo de 5 minutos, hasta un estado terminal: ${ESTADOS_TERMINALES}.
5. Con el documento aprobado, \`descargar_kude\` guarda el PDF.

Ante un error de conexión al emitir, repetí la llamada con la misma \`idempotencyKey\`: devuelve el resultado original.

## Reglas del documento
- ${REGLA_MONTOS}
- ${REGLA_RECEPTOR}
- ${REGLA_NOTAS}
- El emisor, el timbrado y el correlativo salen de la API key.

## Eventos
- Cancelación. ${PLAZOS_CANCELACION}
- Nominación: identifica al receptor de una factura emitida como innominada.
- Inutilización: da de baja un rango de numeración no usado (máximo 1.000 números).

Documentación completa: https://www.sifende.com.py/docs
`;
