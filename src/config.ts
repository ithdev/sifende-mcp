import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  apiKey: string;
  baseUrl: string | undefined;
  permitirEscritura: boolean;
  directorioKude: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const VERDADEROS = new Set(['true', '1']);
const FALSOS = new Set(['', 'false', '0']);

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.SIFENDE_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError(
      'Falta SIFENDE_API_KEY. Creá una API key en el panel de Sifende (API Keys → Crear API Key) y pasala en el bloque "env" de la configuración del cliente MCP.',
    );
  }

  const escritura = (env.SIFENDE_MCP_ALLOW_WRITE ?? '').trim().toLowerCase();
  if (!(VERDADEROS.has(escritura) || FALSOS.has(escritura))) {
    throw new ConfigError(`SIFENDE_MCP_ALLOW_WRITE debe ser "true" o "false"; se recibió "${escritura}".`);
  }

  const baseUrl = env.SIFENDE_BASE_URL?.trim() || undefined;
  if (baseUrl !== undefined && !URL.canParse(baseUrl)) {
    throw new ConfigError(
      `SIFENDE_BASE_URL no es una URL válida: ${baseUrl}. Usá una URL completa, como https://api.sifende.com.py, o quitá la variable.`,
    );
  }

  return {
    apiKey,
    baseUrl,
    permitirEscritura: VERDADEROS.has(escritura),
    directorioKude: env.SIFENDE_MCP_KUDE_DIR?.trim() || join(tmpdir(), 'sifende-mcp', 'kude'),
  };
}
