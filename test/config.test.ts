import { describe, expect, it } from 'vitest';
import { ConfigError, leerConfig } from '../src/config.js';

describe('leerConfig', () => {
  it('testConfigExigeApiKey', () => {
    expect(() => leerConfig({})).toThrow(ConfigError);
    expect(() => leerConfig({ SIFENDE_API_KEY: '   ' })).toThrow(/SIFENDE_API_KEY/);
  });

  it('testConfigEscrituraDeshabilitadaPorDefecto', () => {
    expect(leerConfig({ SIFENDE_API_KEY: 'sk_test_x' }).permitirEscritura).toBe(false);
    expect(leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_MCP_ALLOW_WRITE: 'false' }).permitirEscritura).toBe(
      false,
    );
  });

  it('testConfigHabilitaEscritura', () => {
    expect(leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_MCP_ALLOW_WRITE: 'true' }).permitirEscritura).toBe(true);
    expect(leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_MCP_ALLOW_WRITE: '1' }).permitirEscritura).toBe(true);
  });

  it('testConfigRechazaValorAmbiguoDeEscritura', () => {
    expect(() => leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_MCP_ALLOW_WRITE: 'si' })).toThrow(/ALLOW_WRITE/);
  });

  it('testConfigValidaBaseUrl', () => {
    expect(() => leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_BASE_URL: 'no es url' })).toThrow(
      /SIFENDE_BASE_URL/,
    );
    expect(leerConfig({ SIFENDE_API_KEY: 'sk_test_x', SIFENDE_BASE_URL: 'https://api.ejemplo.test' }).baseUrl).toBe(
      'https://api.ejemplo.test',
    );
  });
});
