import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { KudePendienteError, SifendeApiError, SifendeConexionError } from '@sifende/sdk';

const MAX_VALORES_ACEPTADOS = 30;

export function exito(datos: unknown, extra: CallToolResult['content'] = []): CallToolResult {
  const texto = JSON.stringify(datos ?? null, null, 2);
  const resultado: CallToolResult = { content: [{ type: 'text', text: texto }, ...extra] };
  if (typeof datos === 'object' && datos !== null && !Array.isArray(datos)) {
    resultado.structuredContent = datos as Record<string, unknown>;
  }
  return resultado;
}

export function fallo(mensaje: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: mensaje }] };
}

/** Convierte cualquier error en un mensaje que el modelo pueda leer y accionar. */
export function falloDesdeError(error: unknown): CallToolResult {
  return fallo(describirError(error));
}

export function describirError(error: unknown): string {
  if (error instanceof SifendeApiError) return describirErrorApi(error);
  if (error instanceof KudePendienteError) {
    return `El KuDE de ${error.cdc} sigue en preparación. Esperá unos segundos y volvé a llamar a descargar_kude; si el documento no está APROBADO todavía, consultalo con consultar_documento.`;
  }
  if (error instanceof SifendeConexionError) {
    const lineas = [`No se pudo completar la llamada a la API de Sifende: ${error.message}.`];
    const causa = error.cause instanceof Error ? error.cause.message : undefined;
    if (causa) lineas.push(`Causa: ${causa}`);
    if (error.idempotencyKey) {
      lineas.push(
        `El resultado de la operación es incierto: pudo haberse registrado. Antes de crear otra, repetí la llamada con idempotencyKey="${error.idempotencyKey}" para recuperar el resultado original sin duplicar.`,
      );
    }
    return lineas.join('\n');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'El cliente MCP interrumpió la llamada antes de recibir la respuesta.';
  }
  return error instanceof Error ? error.message : String(error);
}

function describirErrorApi(error: SifendeApiError): string {
  const problema = error.problema;
  const encabezado = `Error ${error.status}${error.codigo ? ` (${error.codigo})` : ''}`;
  const sinEstado = error.message.replace(new RegExp(`^${error.status} `), '');
  const lineas = [`${encabezado}: ${problema?.title ?? sinEstado}`];

  if (problema?.detail) lineas.push(problema.detail);

  const errores = Object.entries(error.errores);
  if (errores.length > 0) {
    lineas.push('Campos con error:');
    for (const [campo, mensaje] of errores) lineas.push(`- ${campo}: ${mensaje}`);
  }
  if (typeof problema?.campo === 'string') lineas.push(`Campo: ${problema.campo}`);
  if (problema?.valorRecibido !== undefined) lineas.push(`Valor recibido: ${String(problema.valorRecibido)}`);

  const aceptados = problema?.valoresAceptados;
  if (Array.isArray(aceptados) && aceptados.length > 0) {
    const nombres = aceptados.map((valor) => (typeof valor === 'string' ? valor : JSON.stringify(valor)));
    const visibles = nombres.slice(0, MAX_VALORES_ACEPTADOS).join(', ');
    const resto = nombres.length - MAX_VALORES_ACEPTADOS;
    lineas.push(
      `Valores aceptados: ${visibles}${resto > 0 ? ` y ${resto} más (usá listar_enumeraciones para verlos todos)` : ''}`,
    );
  }

  if (error.status === 401) {
    lineas.push(
      'Revisá SIFENDE_API_KEY: la clave es inválida, expiró o fue revocada. El usuario puede crear otra en el panel de Sifende (API Keys → Crear API Key).',
    );
  }
  if (error.reintentarEn !== undefined) lineas.push(`Reintentá en ${Math.ceil(error.reintentarEn)} s.`);
  if (error.idempotencyKey && [409, 503].includes(error.status)) {
    lineas.push(`Si repetís la operación, usá la misma idempotencyKey: ${error.idempotencyKey}`);
  }
  if (error.traceId) lineas.push(`traceId: ${error.traceId} (dato para soporte)`);
  if (problema?.type?.startsWith('http')) lineas.push(`Documentación: ${problema.type}`);
  return lineas.join('\n');
}

type Extra = { signal: AbortSignal };

/** Envuelve un handler para que cualquier excepción vuelva al modelo como un error legible. */
export function manejar<A>(fn: (args: A, signal: AbortSignal) => Promise<CallToolResult>) {
  return async (args: A, extra: Extra): Promise<CallToolResult> => {
    try {
      return await fn(args, extra.signal);
    } catch (error) {
      return falloDesdeError(error);
    }
  };
}

export function manejarSinArgs(fn: (signal: AbortSignal) => Promise<CallToolResult>) {
  return async (extra: Extra): Promise<CallToolResult> => {
    try {
      return await fn(extra.signal);
    } catch (error) {
      return falloDesdeError(error);
    }
  };
}
