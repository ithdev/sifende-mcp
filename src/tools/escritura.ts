import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CancelacionRequest,
  EventoInutilizacionRequest,
  EventoNominacionRequest,
  SolicitudEmision,
} from '@sifende/sdk';
import { z } from 'zod';
import { CDC, type Contexto } from '../contexto.js';
import { DOCS_MODELOS } from '../ejemplos.js';
import {
  advertenciaEmision,
  advertenciaEvento,
  PLAZOS_CANCELACION,
  REGLA_ENUMERACIONES,
  REGLA_MONTOS,
  REGLA_NOTAS,
  REGLA_RECEPTOR,
  SEGUIMIENTO_EMISION,
} from '../reglas.js';
import { exito, fallo, manejar } from '../resultado.js';

export const HERRAMIENTAS_EVENTOS = ['cancelar_documento', 'inutilizar_numeracion', 'nominar_documento'] as const;

export const HERRAMIENTAS_ESCRITURA = ['emitir_documento', ...HERRAMIENTAS_EVENTOS] as const;

const TIPOS_DOCUMENTO = Object.keys(DOCS_MODELOS) as [keyof typeof DOCS_MODELOS, ...(keyof typeof DOCS_MODELOS)[]];

const idempotencyKey = z
  .string()
  .regex(
    /^[\x21-\x7E]([\x20-\x7E]{0,253}[\x21-\x7E])?$/,
    'De 1 a 255 caracteres ASCII visibles, sin espacios al inicio ni al final',
  )
  .optional()
  .describe(
    'Clave de idempotencia (1 a 255 caracteres ASCII). Si se omite, se genera una y se devuelve. La misma clave devuelve el resultado original: reintentá con ella tras un corte de conexión.',
  );

const cdcFactura = z.string().regex(CDC, 'El CDC debe tener exactamente 44 dígitos');

const CAMPOS_MONTO_ENTERO = ['montoPago', 'montoEntregaInicial', 'monto'] as const;

/** En guaraníes los totales y pagos no admiten decimales; se corta antes de gastar numeración. */
export function montosNoEnteros(documento: Record<string, unknown>): string[] {
  const moneda = documento.monedaOperacion ?? 'PYG';
  if (moneda !== 'PYG') return [];
  const errores: string[] = [];
  const revisar = (valor: unknown, ruta: string): void => {
    if (Array.isArray(valor)) {
      for (const [indice, elemento] of valor.entries()) revisar(elemento, `${ruta}[${indice}]`);
    } else if (typeof valor === 'object' && valor !== null) {
      for (const [clave, interno] of Object.entries(valor)) {
        const rutaInterna = ruta ? `${ruta}.${clave}` : clave;
        if ((CAMPOS_MONTO_ENTERO as readonly string[]).includes(clave) && typeof interno === 'number') {
          if (!Number.isInteger(interno)) errores.push(`${rutaInterna} = ${interno}`);
        } else if (['condicionPago', 'detalleCuotas', 'pagos', 'credito'].includes(clave)) {
          revisar(interno, rutaInterna);
        }
      }
    }
  };
  revisar(documento, '');
  return errores;
}

export function registrarEscritura(servidor: McpServer, { sifende }: Contexto): void {
  const avisoEmision = advertenciaEmision(sifende.ambiente);
  const avisoEvento = advertenciaEvento(sifende.ambiente);

  servidor.registerTool(
    'emitir_documento',
    {
      title: 'Emitir un documento electrónico',
      description: `Emite un documento electrónico de SIFEN: factura (FACTURA_ELECTRONICA), nota de crédito, nota de débito, nota de remisión o autofactura. Responde enseguida con el CDC en estado PENDIENTE; SIFEN lo aprueba o rechaza después. El emisor, el timbrado y el correlativo salen de la API key. ${REGLA_MONTOS} ${REGLA_ENUMERACIONES} En una venta al contado, montoPago es el totalGeneral de calcular_totales. ${avisoEmision}`,
      inputSchema: {
        documento: z
          .looseObject({
            tipoDocumento: z
              .enum(TIPOS_DOCUMENTO)
              .describe('Tipo de documento a emitir. Determina qué otros campos acepta.'),
            tipoEmision: z.literal('NORMAL').default('NORMAL').describe('Solo se admite NORMAL.'),
            numeroEstablecimiento: z
              .number()
              .int()
              .min(1)
              .max(999)
              .describe('Establecimiento habilitado del emisor (1 a 999).'),
            puntoExpedicion: z
              .number()
              .int()
              .min(1)
              .max(999)
              .describe('Punto de expedición dentro del establecimiento (1 a 999).'),
            receptor: z
              .looseObject({})
              .optional()
              .describe(
                `Receptor del documento; obligatorio salvo en autofactura. ${REGLA_RECEPTOR} Para completarlo desde un RUC o cédula, usá consultar_padron.`,
              ),
            items: z
              .array(z.looseObject({}))
              .min(1)
              .describe(
                'Ítems con codigo, descripcion, unidadMedida, cantidad, precioUnitario (con IVA incluido), afectacionTributaria y tasaIVA.',
              ),
          })
          .describe(
            `Documento con los campos de la API de Sifende (camelCase, como en la documentación). Además de los indicados, enviá los que correspondan al tipo: tipoTransaccion, condicionOperacion, condicionPago, monedaOperacion, fechaEmision, etc. ${REGLA_NOTAS} La API valida el resto y devuelve el detalle de cada campo inválido.`,
          ),
        idempotencyKey,
      },
      annotations: {
        title: 'Emitir un documento electrónico',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    manejar(async ({ documento, idempotencyKey: clave }, signal) => {
      const decimales = montosNoEnteros(documento);
      if (decimales.length > 0) {
        return fallo(
          `No se emitió nada: en guaraníes los montos son enteros, sin decimales. Corregí ${decimales.join(', ')}. Para obtener el montoPago exacto, usá calcular_totales.`,
        );
      }
      const claveUsada = clave ?? crypto.randomUUID();
      const respuesta = await sifende.documentos.emitir(documento as unknown as SolicitudEmision, {
        idempotencyKey: claveUsada,
        signal,
      });
      return exito({
        ...respuesta,
        idempotencyKey: claveUsada,
        siguientePaso: `El documento quedó PENDIENTE. ${SEGUIMIENTO_EMISION}`,
      });
    }),
  );

  // Sandbox no admite eventos: la API siempre responde sandbox-operation-not-supported.
  if (sifende.ambiente === 'SANDBOX') return;

  servidor.registerTool(
    'cancelar_documento',
    {
      title: 'Cancelar un documento aprobado',
      description: `Envía a SIFEN el evento de cancelación de un documento APROBADO o APROBADO_OBSERVACION. Es irreversible. ${PLAZOS_CANCELACION} El resultado está en estadoEvento: solo APROBADO confirma la cancelación, y SIFEN puede responder RECHAZADO con HTTP 200. ${avisoEvento}`,
      inputSchema: {
        cdc: cdcFactura.describe('CDC del documento a cancelar: 44 dígitos.'),
        motivo: z.string().trim().min(5).max(500).describe('Motivo de la cancelación, de 5 a 500 caracteres.'),
        idempotencyKey,
      },
      annotations: {
        title: 'Cancelar un documento aprobado',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    manejar(async ({ cdc, motivo, idempotencyKey: clave }, signal) => {
      const claveUsada = clave ?? crypto.randomUUID();
      const solicitud: CancelacionRequest = { motivo };
      const evento = await sifende.documentos.cancelar(cdc, solicitud, { idempotencyKey: claveUsada, signal });
      return exito({ ...evento, idempotencyKey: claveUsada });
    }),
  );

  servidor.registerTool(
    'inutilizar_numeracion',
    {
      title: 'Inutilizar un rango de numeración',
      description: `Da de baja ante SIFEN un rango de números de documento que no se emitieron (hasta 1.000 números). Es irreversible. numeroFin debe ser mayor que numeroInicio. El resultado está en estadoEvento: APROBADO confirma, RECHAZADO indica que SIFEN no lo aceptó. Si responde idempotency-outcome-unknown, buscá el resultado con listar_eventos. ${avisoEvento}`,
      inputSchema: {
        numeroTimbrado: z.number().int().positive().describe('Número del timbrado.'),
        establecimiento: z
          .string()
          .regex(/^\d{3}$/, 'Tres dígitos, por ejemplo "001"')
          .describe('Código de establecimiento de 3 dígitos, por ejemplo "001".'),
        puntoExpedicion: z
          .string()
          .regex(/^\d{3}$/, 'Tres dígitos, por ejemplo "001"')
          .describe('Código de punto de expedición de 3 dígitos, por ejemplo "001".'),
        numeroInicio: z
          .string()
          .regex(/^\d{1,7}$/, 'De 1 a 7 dígitos')
          .describe('Primer número del rango, de 1 a 7 dígitos, por ejemplo "0000025".'),
        numeroFin: z
          .string()
          .regex(/^\d{1,7}$/, 'De 1 a 7 dígitos')
          .describe('Último número del rango, de 1 a 7 dígitos.'),
        tipoDocumento: z
          .number()
          .int()
          .positive()
          .describe(
            'Código SIFEN del tipo de documento: 1 factura, 4 autofactura, 5 nota de crédito, 6 nota de débito, 7 nota de remisión.',
          ),
        motivo: z.string().trim().min(5).max(500).describe('Motivo de la inutilización, de 5 a 500 caracteres.'),
        serie: z.string().trim().max(2).optional().describe('Serie de hasta 2 caracteres, si el timbrado la usa.'),
        idempotencyKey,
      },
      annotations: {
        title: 'Inutilizar un rango de numeración',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    manejar(async ({ idempotencyKey: clave, serie, ...rango }, signal) => {
      if (Number(rango.numeroFin) <= Number(rango.numeroInicio)) {
        return fallo(
          `No se envió nada: numeroFin (${rango.numeroFin}) debe ser mayor que numeroInicio (${rango.numeroInicio}).`,
        );
      }
      const claveUsada = clave ?? crypto.randomUUID();
      const solicitud: EventoInutilizacionRequest = { ...rango, ...(serie ? { serie } : {}) };
      const evento = await sifende.documentos.inutilizar(solicitud, { idempotencyKey: claveUsada, signal });
      return exito({ ...evento, idempotencyKey: claveUsada });
    }),
  );

  servidor.registerTool(
    'nominar_documento',
    {
      title: 'Nominar una factura innominada',
      description: `Identifica al receptor de una factura aprobada que se emitió como innominada (tipoDocumento INNOMINADO, numeroDocumento "0"). No modifica el CDC ni el KuDE originales y no consume numeración. El receptor de la nominación usa nombres distintos al de la emisión: naturaleza, ruc, tipoContribuyente, codigoCiudad. El resultado está en estadoEvento. ${avisoEvento}`,
      inputSchema: {
        cdc: cdcFactura.describe('CDC de la factura (empieza con 01): 44 dígitos.'),
        motivo: z.string().trim().min(5).max(500).describe('Motivo de la nominación, de 5 a 500 caracteres.'),
        receptor: z
          .looseObject({
            naturaleza: z.enum(['CONTRIBUYENTE', 'NO_CONTRIBUYENTE']).describe('Si el receptor tiene RUC o no.'),
            tipoOperacion: z.enum(['B2B', 'B2C', 'B2F']).describe('Tipo de operación.'),
            pais: z
              .string()
              .length(3)
              .describe('Código ISO de país de 3 letras, por ejemplo "PRY". Valores en listar_enumeraciones.'),
            nombreRazonSocial: z
              .string()
              .trim()
              .min(4)
              .max(255)
              .describe('Nombre o razón social, de 4 a 255 caracteres.'),
          })
          .describe(
            'Receptor que reemplaza al innominado. Para B2B agregá tipoContribuyente (PERSONA_FISICA o PERSONA_JURIDICA), ruc (3 a 8 dígitos, sin DV) y digitoVerificador. Para B2C agregá tipoDocumento y numeroDocumento. Opcionales: direccion, email, telefono, departamento, codigoDistrito, codigoCiudad.',
          ),
        idempotencyKey,
      },
      annotations: {
        title: 'Nominar una factura innominada',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    manejar(async ({ cdc, motivo, receptor, idempotencyKey: clave }, signal) => {
      const claveUsada = clave ?? crypto.randomUUID();
      const solicitud = { motivo, receptor } as unknown as EventoNominacionRequest;
      const evento = await sifende.documentos.nominar(cdc, solicitud, { idempotencyKey: claveUsada, signal });
      return exito({ ...evento, idempotencyKey: claveUsada });
    }),
  );
}
