import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Contexto } from './contexto.js';
import { registrarRecursos } from './recursos.js';
import { describirAmbiente, HABILITAR_ESCRITURA } from './reglas.js';
import { registrarEscritura } from './tools/escritura.js';
import { registrarLectura } from './tools/lectura.js';
import { VERSION } from './version.js';

export interface OpcionesServidor extends Contexto {
  fetch?: typeof fetch;
}

function instrucciones({ sifende, config }: Contexto): string {
  const escritura = config.permitirEscritura
    ? 'Para armar un documento, partí de obtener_ejemplo_documento.'
    : `La escritura está deshabilitada: solo hay herramientas de consulta. ${HABILITAR_ESCRITURA}`;
  return [
    'Servidor oficial de Sifende para facturación electrónica de SIFEN (Paraguay).',
    describirAmbiente(sifende.ambiente),
    escritura,
    'Cuando una respuesta trae siguientePaso, hacé eso a continuación.',
  ].join(' ');
}

export function crearServidor({ fetch: obtener, ...contexto }: OpcionesServidor): McpServer {
  const servidor = new McpServer(
    { name: 'sifende', title: 'Sifende', version: VERSION },
    { instructions: instrucciones(contexto) },
  );
  registrarLectura(servidor, contexto);
  if (contexto.config.permitirEscritura) registrarEscritura(servidor, contexto);
  registrarRecursos(servidor, obtener);
  return servidor;
}
