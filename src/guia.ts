export const GUIA_RAPIDA = `# Guía rápida de Sifende para agentes

Sifende es una API de facturación electrónica para SIFEN (Paraguay). Este servidor MCP usa la API key del contribuyente.

## Ambiente
El prefijo de la API key fija el ambiente: \`sk_sandbox_\` (Sandbox de Sifende, sin envío a SIFEN), \`sk_test_\` (pruebas con SIFEN) y \`sk_live_\` (producción, con validez fiscal). Llamá a \`informacion_servidor\` para ver cuál es.

## Flujo de emisión
1. Armá el documento. Partí de \`obtener_ejemplo_documento\` y verificá los valores de enumeración con \`listar_enumeraciones\`.
2. Si hay montos, calculá el total con \`calcular_totales\`: en contado, \`montoPago\` debe coincidir con el total redondeado.
3. \`emitir_documento\` responde enseguida con el CDC y estado \`PENDIENTE\`. Guardá la \`idempotencyKey\` que devuelve: sirve para reintentar sin duplicar.
4. Llamá a \`consultar_documento\` cada 5 segundos, por un máximo de 5 minutos, hasta un estado terminal: \`APROBADO\`, \`APROBADO_OBSERVACION\` (también es éxito), \`RECHAZADO\`, \`CANCELADO\` o \`ERROR\`.
5. Con el documento aprobado, \`descargar_kude\` guarda el PDF.

## Errores más comunes
- Los montos en guaraníes son enteros, sin decimales ni separadores de miles.
- Receptor con \`tipoContribuyente\` CONTRIBUYENTE (tiene RUC): lleva \`tipoContribuyenteReceptor\` y \`digitoVerificador\`, y no lleva \`tipoDocumento\`. Receptor NO_CONTRIBUYENTE: lleva \`tipoDocumento\` y no lleva los otros dos. Consumidor sin nombre: tipoDocumento INNOMINADO, numeroDocumento "0", nombreRazonSocial "Sin Nombre".
- El emisor, el timbrado y el correlativo no se envían: salen de la API key.
- Nota de crédito y de débito requieren \`motivoEmision\` y \`documentoAsociado\`, y no llevan \`tipoTransaccion\` ni \`condicionOperacion\`.
- Nunca inventes valores de enumeración: consultalos con \`listar_enumeraciones\`.
- Ante un error de conexión al emitir, repetí con la misma \`idempotencyKey\` en vez de crear otro documento.

## Eventos
- Cancelación: factura hasta 48 horas después de aprobada; notas de crédito, débito y remisión hasta 168 horas.
- Nominación: identifica al receptor de una factura emitida como innominada.
- Inutilización: da de baja un rango de numeración no usado (máximo 1.000 números).
- Sandbox no soporta eventos.

Documentación completa: https://www.sifende.com.py/docs
`;
