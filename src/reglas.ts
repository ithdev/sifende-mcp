import type { Sifende } from '@sifende/sdk';

/**
 * Textos que el modelo lee en más de un lugar (instrucciones, descripciones, guía). Cada regla vive acá una
 * sola vez; los textos que dependen del ambiente se arman con el prefijo de la API key, así el modelo recibe
 * solo el caso que aplica.
 */

type Ambiente = Sifende['ambiente'];

export const REGLA_MONTOS = 'Los montos en guaraníes son enteros, sin decimales ni separadores de miles.';

export const REGLA_ENUMERACIONES = 'Tomá cada valor de enumeración de listar_enumeraciones.';

export const REGLA_RECEPTOR =
  'Receptor con RUC (tipoContribuyente CONTRIBUYENTE): numeroDocumento es el RUC sin dígito verificador y van también tipoContribuyenteReceptor y digitoVerificador, sin tipoDocumento. Receptor sin RUC (NO_CONTRIBUYENTE): tipoDocumento y numeroDocumento. Consumidor final sin identificar: tipoDocumento INNOMINADO, numeroDocumento "0" y nombreRazonSocial "Sin Nombre".';

export const REGLA_NOTAS =
  'Nota de crédito y nota de débito: llevan motivoEmision y documentoAsociado (el CDC de la factura que corrigen), sin tipoTransaccion ni condicionOperacion.';

export const ESTADOS_TERMINALES = 'APROBADO, APROBADO_OBSERVACION (también es éxito), RECHAZADO, CANCELADO o ERROR';

export const SEGUIMIENTO_EMISION =
  'Llamá a consultar_documento con este cdc cada 5 segundos hasta un estado terminal, por un máximo de 5 minutos.';

export const PLAZOS_CANCELACION =
  'Plazo: 48 horas desde la aprobación para facturas y 168 horas para notas de crédito, débito y remisión.';

export const HABILITAR_ESCRITURA =
  'Para emitir, el usuario tiene que agregar SIFENDE_MCP_ALLOW_WRITE=true en el bloque "env" del cliente MCP y reiniciar el servidor.';

const CONFIRMAR = 'Confirmá los datos con el usuario antes de llamarla.';

export function describirAmbiente(ambiente: Ambiente): string {
  switch (ambiente) {
    case 'PROD':
      return 'Ambiente: producción (API key sk_live_). Cada documento y evento es una operación fiscal real ante la SET.';
    case 'DEV':
      return 'Ambiente: pruebas con SIFEN (API key sk_test_). SIFEN valida los documentos, que no tienen validez fiscal.';
    case 'SANDBOX':
      return 'Ambiente: Sandbox de Sifende (API key sk_sandbox_). Los documentos no se envían a SIFEN ni tienen validez fiscal. Las herramientas de eventos (cancelar, inutilizar, nominar) no están disponibles: hacen falta una API key sk_test_ o sk_live_.';
    default:
      return 'La API key no tiene un prefijo conocido. Llamá a consultar_contribuyente para saber el ambiente antes de emitir.';
  }
}

export function advertenciaEmision(ambiente: Ambiente): string {
  switch (ambiente) {
    case 'PROD':
      return `ATENCIÓN: la API key es de producción. Esto registra un documento fiscal real ante la SET, con validez legal, y consume numeración y cupo del plan. ${CONFIRMAR}`;
    case 'DEV':
      return 'Ambiente de pruebas con SIFEN: el documento no tiene validez fiscal.';
    case 'SANDBOX':
      return 'Ambiente Sandbox: el documento no se envía a SIFEN ni tiene validez fiscal.';
    default:
      return `ATENCIÓN: con una API key sk_live_ esto registra un documento fiscal real ante la SET, con validez legal, y consume numeración y cupo del plan. ${CONFIRMAR}`;
  }
}

export function advertenciaEvento(ambiente: Ambiente): string {
  switch (ambiente) {
    case 'PROD':
      return `ATENCIÓN: la API key es de producción. Esto registra un evento fiscal real ante la SET, con validez legal. ${CONFIRMAR}`;
    case 'DEV':
      return 'Ambiente de pruebas con SIFEN: el evento no tiene validez fiscal.';
    default:
      return `ATENCIÓN: con una API key sk_live_ esto registra un evento fiscal real ante la SET, con validez legal. ${CONFIRMAR}`;
  }
}
