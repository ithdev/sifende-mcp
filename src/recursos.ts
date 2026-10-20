import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EJEMPLOS, type NombreEjemplo } from './ejemplos.js';
import { GUIA_RAPIDA } from './guia.js';

const URL_LLMS = 'https://www.sifende.com.py/llms.txt';

export function registrarRecursos(servidor: McpServer, obtener: typeof fetch = fetch): void {
  servidor.registerResource(
    'guia-rapida',
    'sifende://guia/rapida',
    {
      title: 'Guía rápida de Sifende',
      description: 'Flujo de emisión, errores más comunes y eventos, en una página.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIA_RAPIDA }] }),
  );

  servidor.registerResource(
    'llms-txt',
    'sifende://docs/llms.txt',
    {
      title: 'Índice de la documentación (llms.txt)',
      description: 'Índice de la documentación oficial de Sifende, descargado de sifende.com.py.',
      mimeType: 'text/plain',
    },
    async (uri) => {
      const respuesta = await obtener(URL_LLMS);
      if (!respuesta.ok) throw new Error(`No se pudo descargar ${URL_LLMS}: HTTP ${respuesta.status}`);
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: await respuesta.text() }] };
    },
  );

  servidor.registerResource(
    'ejemplos',
    new ResourceTemplate('sifende://ejemplos/{nombre}', {
      list: () => ({
        resources: Object.entries(EJEMPLOS).map(([nombre, ejemplo]) => ({
          uri: `sifende://ejemplos/${nombre}`,
          name: nombre,
          description: ejemplo.descripcion,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Documentos de ejemplo',
      description: 'Documentos de ejemplo con datos ficticios, listos para adaptar.',
      mimeType: 'application/json',
    },
    (uri, { nombre }) => {
      const clave = String(nombre) as NombreEjemplo;
      const ejemplo = EJEMPLOS[clave];
      if (!ejemplo) throw new Error(`No existe el ejemplo "${String(nombre)}"`);
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(ejemplo.documento, null, 2) }],
      };
    },
  );
}
