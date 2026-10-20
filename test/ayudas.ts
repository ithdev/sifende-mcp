import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Sifende } from '@sifende/sdk';
import { vi } from 'vitest';
import type { Config } from '../src/config.js';
import { crearServidor } from '../src/servidor.js';

export type Fetch = ReturnType<typeof vi.fn<typeof fetch>>;

export function json(cuerpo: unknown, init: ResponseInit & { problema?: boolean } = {}): Response {
  const { problema, ...resto } = init;
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    ...resto,
    headers: { 'content-type': problema ? 'application/problem+json' : 'application/json', ...resto.headers },
  });
}

export function pdf(): Response {
  return new Response(new TextEncoder().encode('%PDF-1.7 contenido de prueba'), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });
}

export function textoDe(resultado: CallToolResult): string {
  const bloque = resultado.content[0];
  return bloque?.type === 'text' ? bloque.text : '';
}

export function datosDe(resultado: CallToolResult): Record<string, unknown> {
  return JSON.parse(textoDe(resultado)) as Record<string, unknown>;
}

interface Opciones {
  escritura?: boolean;
  fetch?: Fetch;
  apiKey?: string;
  directorioKude?: string;
}

export async function conectar(opciones: Opciones = {}) {
  const solicitud: Fetch = opciones.fetch ?? vi.fn<typeof fetch>(async () => json({}));
  const sifende = new Sifende({
    apiKey: opciones.apiKey ?? 'sk_test_clave-de-prueba',
    fetch: solicitud,
    maxReintentos: 0,
  });
  const config: Config = {
    apiKey: opciones.apiKey ?? 'sk_test_clave-de-prueba',
    baseUrl: undefined,
    permitirEscritura: opciones.escritura ?? false,
    directorioKude: opciones.directorioKude ?? '/tmp/sifende-mcp-test',
  };
  const servidor = crearServidor({ sifende, config, fetch: solicitud });
  const cliente = new Client({ name: 'prueba', version: '0.0.0' });
  const [transporteCliente, transporteServidor] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(transporteServidor), cliente.connect(transporteCliente)]);

  return {
    cliente,
    solicitud,
    async llamar(nombre: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
      return (await cliente.callTool({ name: nombre, arguments: args })) as CallToolResult;
    },
    async cerrar() {
      await cliente.close();
      await servidor.close();
    },
  };
}
