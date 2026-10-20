import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Contexto } from './contexto.js';
import { registrarRecursos } from './recursos.js';
import { registrarEscritura } from './tools/escritura.js';
import { registrarLectura } from './tools/lectura.js';
import { VERSION } from './version.js';

export interface OpcionesServidor extends Contexto {
  fetch?: typeof fetch;
}

const INSTRUCCIONES =
  'Servidor oficial de Sifende para facturación electrónica de SIFEN (Paraguay). Antes de emitir, llamá a informacion_servidor para saber el ambiente y si la escritura está habilitada. Los montos en guaraníes son enteros y los valores de enumeración salen de listar_enumeraciones. Ante un error de conexión al emitir, repetí con la misma idempotencyKey en vez de crear otro documento.';

export function crearServidor({ fetch: obtener, ...contexto }: OpcionesServidor): McpServer {
  const servidor = new McpServer(
    { name: 'sifende', title: 'Sifende', version: VERSION },
    { instructions: INSTRUCCIONES },
  );
  registrarLectura(servidor, contexto);
  if (contexto.config.permitirEscritura) registrarEscritura(servidor, contexto);
  registrarRecursos(servidor, obtener);
  return servidor;
}
