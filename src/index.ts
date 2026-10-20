#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Sifende } from '@sifende/sdk';
import { ConfigError, leerConfig } from './config.js';
import { crearServidor } from './servidor.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  const config = leerConfig();
  const sifende = new Sifende({ apiKey: config.apiKey, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
  const servidor = crearServidor({ sifende, config });

  // stdout es el canal del protocolo: todo log va a stderr.
  console.error(
    `sifende-mcp ${VERSION}: ambiente ${sifende.ambiente ?? 'desconocido'}, escritura ${config.permitirEscritura ? 'HABILITADA' : 'deshabilitada'}`,
  );
  if (config.permitirEscritura && sifende.ambiente === 'PROD') {
    console.error(
      'ADVERTENCIA: la escritura está habilitada con una API key de producción; los documentos emitidos tienen validez fiscal.',
    );
  }

  await servidor.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? `Configuración inválida: ${error.message}` : error);
  process.exit(1);
});
