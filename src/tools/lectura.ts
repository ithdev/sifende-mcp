import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { calcularTotales, type ItemDto } from '@sifende/sdk';
import { z } from 'zod';
import { CDC, type Contexto } from '../contexto.js';
import { DOCS_MODELOS, EJEMPLOS, NOMBRES_EJEMPLO } from '../ejemplos.js';
import { ESTADOS_TERMINALES, HABILITAR_ESCRITURA } from '../reglas.js';
import { exito, fallo, falloDesdeError, manejar, manejarSinArgs } from '../resultado.js';
import { VERSION } from '../version.js';

const SOLO_LECTURA: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };
const LOCAL: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };

const AFECTACIONES = ['GRAVADO', 'EXONERADO', 'EXENTO', 'GRAVADO_PARCIAL'] as const satisfies readonly NonNullable<
  ItemDto['afectacionTributaria']
>[];

const cdc = z
  .string()
  .regex(CDC, 'El CDC debe tener exactamente 44 dígitos')
  .describe('CDC (Código de Control del Documento Electrónico): 44 dígitos.');

export const HERRAMIENTAS_LECTURA = [
  'informacion_servidor',
  'consultar_documento',
  'descargar_kude',
  'consultar_contribuyente',
  'consultar_padron',
  'consultar_consumo_plan',
  'listar_enumeraciones',
  'consultar_geografia',
  'listar_eventos',
  'consultar_evento',
  'calcular_totales',
  'obtener_ejemplo_documento',
] as const;

export function registrarLectura(servidor: McpServer, { sifende, config }: Contexto): void {
  servidor.registerTool(
    'informacion_servidor',
    {
      title: 'Información del servidor Sifende',
      description:
        'Muestra con qué ambiente está conectado este servidor (Sandbox, pruebas con SIFEN o producción), si las herramientas de escritura están habilitadas y la versión. No hace llamadas a la red.',
      annotations: { ...LOCAL, title: 'Información del servidor Sifende' },
    },
    async () =>
      exito({
        servidor: '@sifende/mcp',
        version: VERSION,
        ambiente:
          sifende.ambiente ??
          'DESCONOCIDO (la API key no tiene un prefijo conocido; consultar_contribuyente informa el ambiente real)',
        validezFiscal: sifende.ambiente === 'PROD',
        baseUrl: config.baseUrl ?? 'https://api.sifende.com.py',
        escrituraHabilitada: config.permitirEscritura,
        ...(config.permitirEscritura
          ? {}
          : {
              siguientePaso: `La escritura está deshabilitada. ${HABILITAR_ESCRITURA}`,
            }),
      }),
  );

  servidor.registerTool(
    'consultar_documento',
    {
      title: 'Consultar estado de un documento',
      description: `Consulta el estado de un documento electrónico por su CDC: PENDIENTE o un estado terminal, que puede ser ${ESTADOS_TERMINALES}. Incluye el protocolo de autorización de SIFEN y, si fue rechazado, el motivo (mensajeRechazo).`,
      inputSchema: { cdc },
      annotations: { ...SOLO_LECTURA, title: 'Consultar estado de un documento' },
    },
    manejar(async ({ cdc }: { cdc: string }, signal) =>
      exito(await sifende.documentos.consultarEstado(cdc, { signal })),
    ),
  );

  servidor.registerTool(
    'descargar_kude',
    {
      title: 'Descargar el KuDE (PDF)',
      description:
        'Descarga el KuDE (representación gráfica en PDF) de un documento APROBADO y lo guarda en un archivo local; devuelve la ruta. Si el PDF todavía se está preparando, espera hasta esperarSegundos y, si no llega, avisa para reintentar. Con una API key sandbox el PDF dice "SIN VALIDEZ FISCAL". Con incluirBase64 devuelve además el PDF embebido, que pesa mucho en el contexto del modelo: usalo solo si el cliente no puede leer el archivo.',
      inputSchema: {
        cdc,
        esperarSegundos: z
          .number()
          .int()
          .min(0)
          .max(170)
          .default(45)
          .describe('Cuánto esperar a que el PDF esté listo. Por defecto 45 s; el máximo es 170 s.'),
        incluirBase64: z.boolean().default(false).describe('Incluir el PDF embebido en la respuesta. Por defecto no.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        title: 'Descargar el KuDE (PDF)',
      },
    },
    manejar(
      async (
        { cdc, esperarSegundos, incluirBase64 }: { cdc: string; esperarSegundos: number; incluirBase64: boolean },
        signal,
      ) => {
        const pdf = await sifende.documentos.descargarKude(cdc, { esperarMs: esperarSegundos * 1000, signal });
        if (!(pdf.length > 4 && String.fromCharCode(...pdf.subarray(0, 4)) === '%PDF')) {
          return fallo(
            'La API respondió algo que no es un PDF. Reintentá en unos segundos o revisá el estado del documento con consultar_documento.',
          );
        }
        await mkdir(config.directorioKude, { recursive: true, mode: 0o700 });
        const archivo = join(config.directorioKude, `kude-${cdc}.pdf`);
        await writeFile(archivo, pdf);
        const adjunto: CallToolResult['content'] = incluirBase64
          ? [
              {
                type: 'resource',
                resource: {
                  uri: `sifende://kude/${cdc}`,
                  mimeType: 'application/pdf',
                  blob: Buffer.from(pdf).toString('base64'),
                },
              },
            ]
          : [];
        return exito({ cdc, archivo, bytes: pdf.length }, adjunto);
      },
    ),
  );

  servidor.registerTool(
    'consultar_contribuyente',
    {
      title: 'Consultar el contribuyente de la API key',
      description:
        'Devuelve los datos del contribuyente dueño de la API key: RUC, razón social, tipo, ambiente, actividades económicas y domicilio. Es el emisor de todos los documentos.',
      annotations: { ...SOLO_LECTURA, title: 'Consultar el contribuyente de la API key' },
    },
    manejarSinArgs(async (signal) => exito(await sifende.contribuyente.consultar({ signal }))),
  );

  servidor.registerTool(
    'consultar_padron',
    {
      title: 'Consultar RUC o cédula en el padrón',
      description:
        'Busca un RUC o una cédula en el padrón de la SET y devuelve razón social, tipo de contribuyente y domicilio, con los mismos nombres de campo que el receptor de un documento. Usala para completar el receptor de una factura. Acepta el número con o sin puntos y con o sin dígito verificador.',
      inputSchema: {
        // Algunos clientes mandan el RUC como número; con 8 dígitos no hay pérdida de precisión.
        documento: z
          .preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim().min(1).max(20))
          .describe('RUC o cédula, por ejemplo "80012345-0", "80012345" o "1.234.567".'),
      },
      annotations: { ...SOLO_LECTURA, title: 'Consultar RUC o cédula en el padrón' },
    },
    manejar(async ({ documento }: { documento: string }, signal) => {
      const datos = await sifende.padron.consultar(documento, { signal });
      if (datos) return exito(datos);
      return exito({
        encontrado: false,
        documento,
        siguientePaso:
          'Verificá el número con el usuario. Si es correcto, el receptor no está inscripto como contribuyente: emitilo como NO_CONTRIBUYENTE con tipoDocumento y numeroDocumento.',
      });
    }),
  );

  servidor.registerTool(
    'consultar_consumo_plan',
    {
      title: 'Consultar el consumo del plan',
      description:
        'Muestra el plan vigente del contribuyente y su consumo del período: documentos incluidos, consumidos, reservados y disponibles, si admite documentos adicionales y el costo estimado en guaraníes.',
      annotations: { ...SOLO_LECTURA, title: 'Consultar el consumo del plan' },
    },
    manejarSinArgs(async (signal) => exito(await sifende.contribuyente.consultarConsumoPlan({ signal }))),
  );

  servidor.registerTool(
    'listar_enumeraciones',
    {
      title: 'Listar enumeraciones de la API',
      description:
        'Devuelve los valores válidos de las enumeraciones de la API (tipoDocumento, tipoPago, unidadMedida, afectacionTributaria, monedaOperacion, país, motivoEmision, etc.). Sin parámetros lista los nombres de las enumeraciones; con "nombre" devuelve sus valores. Usala antes de enviar un valor de enumeración: un nombre aproximado falla recién al emitir.',
      inputSchema: {
        nombre: z
          .string()
          .trim()
          .optional()
          .describe(
            'Nombre de la enumeración, por ejemplo "tipoPago" o "unidadMedida". Si se omite, lista los nombres.',
          ),
      },
      annotations: { ...SOLO_LECTURA, title: 'Listar enumeraciones de la API' },
    },
    manejar(async ({ nombre }: { nombre?: string | undefined }, signal) => {
      const enumeraciones = await sifende.catalogos.enumeraciones({ signal });
      if (!nombre) {
        return exito({
          enumeraciones: Object.entries(enumeraciones).map(([clave, valores]) => ({
            nombre: clave,
            cantidad: valores.length,
          })),
          siguientePaso: 'Llamá de nuevo con "nombre" para ver los valores de una enumeración.',
        });
      }
      const clave = Object.keys(enumeraciones).find((candidata) => candidata.toLowerCase() === nombre.toLowerCase());
      if (!clave) {
        return fallo(`No existe la enumeración "${nombre}". Disponibles: ${Object.keys(enumeraciones).join(', ')}.`);
      }
      return exito({ nombre: clave, valores: enumeraciones[clave] });
    }),
  );

  servidor.registerTool(
    'consultar_geografia',
    {
      title: 'Consultar departamentos, distritos y ciudades',
      description:
        'Catálogo geográfico de SIFEN para domicilios. nivel "departamentos" lista todos; "distritos" lista los de un departamento (id = departamentoId); "ciudades" lista las de un distrito (id = distritoId). Los códigos se usan en el domicilio del receptor.',
      inputSchema: {
        nivel: z.enum(['departamentos', 'distritos', 'ciudades']).describe('Nivel que se quiere listar.'),
        id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Obligatorio para "distritos" (id del departamento) y "ciudades" (id del distrito).'),
      },
      annotations: { ...SOLO_LECTURA, title: 'Consultar departamentos, distritos y ciudades' },
    },
    manejar(
      async ({ nivel, id }: { nivel: 'departamentos' | 'distritos' | 'ciudades'; id?: number | undefined }, signal) => {
        if (nivel === 'departamentos')
          return exito({ departamentos: await sifende.catalogos.departamentos({ signal }) });
        if (id === undefined) {
          const [padre, nivelPadre] =
            nivel === 'distritos' ? ['del departamento', 'departamentos'] : ['del distrito', 'distritos'];
          return fallo(`El nivel "${nivel}" requiere id: el id ${padre}. Obtenelo con nivel "${nivelPadre}".`);
        }
        if (nivel === 'distritos') return exito({ distritos: await sifende.catalogos.distritos(id, { signal }) });
        return exito({ ciudades: await sifende.catalogos.ciudades(id, { signal }) });
      },
    ),
  );

  servidor.registerTool(
    'listar_eventos',
    {
      title: 'Listar eventos de documentos',
      description:
        'Lista los eventos registrados (cancelación, inutilización, nominación) con su estado ante SIFEN, paginados. Filtrá por tipoEvento con un valor de listar_enumeraciones.',
      inputSchema: {
        pagina: z.number().int().min(0).default(0).describe('Número de página, desde 0.'),
        tamanio: z.number().int().min(1).max(100).default(20).describe('Eventos por página (1 a 100).'),
        tipoEvento: z.string().trim().optional().describe('Filtro por tipo de evento.'),
      },
      annotations: { ...SOLO_LECTURA, title: 'Listar eventos de documentos' },
    },
    manejar(
      async (
        { pagina, tamanio, tipoEvento }: { pagina: number; tamanio: number; tipoEvento?: string | undefined },
        signal,
      ) =>
        exito(
          await sifende.documentos.listarEventos(
            { page: pagina, size: tamanio, ...(tipoEvento ? { tipoEvento } : {}) },
            { signal },
          ),
        ),
    ),
  );

  servidor.registerTool(
    'consultar_evento',
    {
      title: 'Consultar un evento',
      description:
        'Detalle de un evento por su id (eventoSifenId): estado (APROBADO o RECHAZADO), código y mensaje de respuesta de SIFEN. Confirmá el resultado de una cancelación, nominación o inutilización con esta herramienta.',
      inputSchema: { eventoId: z.number().int().positive().describe('Id del evento (eventoSifenId).') },
      annotations: { ...SOLO_LECTURA, title: 'Consultar un evento' },
    },
    manejar(async ({ eventoId }: { eventoId: number }, signal) =>
      exito(await sifende.documentos.consultarEvento(eventoId, { signal })),
    ),
  );

  servidor.registerTool(
    'calcular_totales',
    {
      title: 'Calcular totales de un documento',
      description:
        'Calcula el total de un documento con las mismas reglas que valida Sifende, incluido el redondeo oficial de la SET (en guaraníes, al múltiplo de 50 inferior). Usala para obtener el montoPago exacto de una venta al contado antes de emitir. Los precios incluyen IVA. Es un cálculo local, sin llamar a la API.',
      inputSchema: {
        monedaOperacion: z
          .string()
          .trim()
          .default('PYG')
          .describe('Código de moneda de la operación. Por defecto PYG (guaraníes).'),
        tipoCambio: z
          .number()
          .positive()
          .optional()
          .describe('Tipo de cambio global; obligatorio fuera de PYG si los ítems no traen el suyo.'),
        descuentoGlobalPorcentaje: z
          .number()
          .gt(0)
          .max(100)
          .optional()
          .describe('Porcentaje de descuento global aplicado a cada ítem.'),
        comision: z.number().min(0).optional().describe('Comisión de la operación, con IVA 10% incluido.'),
        items: z
          .array(
            z.object({
              precioUnitario: z
                .number()
                .min(0)
                .describe('Precio unitario con IVA incluido y sin descuentos. En guaraníes, un entero.'),
              cantidad: z.number().positive().describe('Cantidad; admite decimales.'),
              afectacionTributaria: z.enum(AFECTACIONES).describe('Afectación al IVA del ítem.'),
              tasaIVA: z.number().optional().describe('Tasa de IVA: 10, 5 o 0.'),
              propIVA: z
                .number()
                .min(0)
                .max(100)
                .optional()
                .describe('Proporción gravada en porcentaje; solo para GRAVADO_PARCIAL.'),
              descuentoParticular: z
                .number()
                .min(0)
                .optional()
                .describe('Descuento en importe sobre el precio unitario.'),
              descuentoParticularPorcentaje: z
                .number()
                .gt(0)
                .max(100)
                .optional()
                .describe('Descuento en porcentaje sobre el precio unitario.'),
              tipoCambio: z.number().positive().optional().describe('Tipo de cambio del ítem, si difiere del global.'),
            }),
          )
          .min(1)
          .describe('Ítems del documento, con los mismos nombres de campo que en emitir_documento.'),
      },
      annotations: { ...LOCAL, title: 'Calcular totales de un documento' },
    },
    async (args) => {
      try {
        const { monedaOperacion, items, ...resto } = args;
        const totales = calcularTotales({
          monedaOperacion,
          ...resto,
          items: items.map((item) => ({ ...item })),
        });
        return exito({
          monedaOperacion,
          ...totales,
          siguientePaso: 'En una venta al contado, usá totalGeneral como montoPago.',
        });
      } catch (error) {
        return falloDesdeError(error);
      }
    },
  );

  servidor.registerTool(
    'obtener_ejemplo_documento',
    {
      title: 'Obtener un ejemplo de documento',
      description:
        'Devuelve un documento de ejemplo con datos ficticios, listo para adaptar y enviar a emitir_documento: factura al contado B2C o B2B, factura a crédito en cuotas, nota de crédito y nota de débito. Para nota de remisión y autofactura devuelve el enlace al modelo en la documentación. Reemplazá los datos ficticios (receptor, ítems, CDC asociado) antes de emitir.',
      inputSchema: {
        ejemplo: z.enum([...NOMBRES_EJEMPLO, 'nota_remision', 'autofactura']).describe('Tipo de ejemplo.'),
      },
      annotations: { ...LOCAL, title: 'Obtener un ejemplo de documento' },
    },
    async ({ ejemplo }) => {
      if (ejemplo === 'nota_remision' || ejemplo === 'autofactura') {
        const tipo = ejemplo === 'nota_remision' ? 'NOTA_DE_REMISION_ELECTRONICA' : 'AUTOFACTURA_ELECTRONICA';
        return exito({
          tipoDocumento: tipo,
          documentacion: DOCS_MODELOS[tipo],
          siguientePaso:
            'Este tipo tiene un contrato propio: leé los campos en documentacion antes de armar el documento.',
        });
      }
      const { descripcion, documento } = EJEMPLOS[ejemplo];
      return exito({ descripcion, documento });
    },
  );
}
