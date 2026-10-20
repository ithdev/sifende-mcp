import { afterEach, describe, expect, it } from 'vitest';
import { HERRAMIENTAS_ESCRITURA, HERRAMIENTAS_EVENTOS } from '../src/tools/escritura.js';
import { HERRAMIENTAS_LECTURA } from '../src/tools/lectura.js';
import { conectar, datosDe } from './ayudas.js';

let sesion: Awaited<ReturnType<typeof conectar>> | undefined;
afterEach(async () => sesion?.cerrar());

describe('catálogo de herramientas', () => {
  it('testListaSoloLecturaPorDefecto', async () => {
    sesion = await conectar();
    const { tools } = await sesion.cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...HERRAMIENTAS_LECTURA].sort());
    expect(tools.every((t) => t.annotations?.destructiveHint !== true)).toBe(true);
  });

  it('testListaEscrituraSoloConAllowWrite', async () => {
    sesion = await conectar({ escritura: true });
    const { tools } = await sesion.cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...HERRAMIENTAS_LECTURA, ...HERRAMIENTAS_ESCRITURA].sort());
  });

  it('testLecturaDeclaraReadOnlyHintSalvoKude', async () => {
    sesion = await conectar();
    const { tools } = await sesion.cliente.listTools();
    for (const tool of tools) {
      const esperado = tool.name !== 'descargar_kude';
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(esperado);
      expect(tool.description, tool.name).toBeTruthy();
    }
  });

  it('testEscrituraDeclaraAnotacionesCorrectas', async () => {
    sesion = await conectar({ escritura: true });
    const { tools } = await sesion.cliente.listTools();
    const por = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const nombre of HERRAMIENTAS_ESCRITURA) {
      expect(por[nombre]?.annotations?.readOnlyHint, nombre).toBe(false);
      expect(por[nombre]?.annotations?.openWorldHint, nombre).toBe(true);
    }
    expect(por.cancelar_documento?.annotations?.destructiveHint).toBe(true);
    expect(por.inutilizar_numeracion?.annotations?.destructiveHint).toBe(true);
    expect(por.emitir_documento?.annotations?.destructiveHint).toBe(false);
    expect(por.emitir_documento?.annotations?.idempotentHint).toBe(false);
  });

  it('testEscrituraEnProduccionAdvierteValidezFiscal', async () => {
    sesion = await conectar({ escritura: true, apiKey: 'sk_live_abc' });
    const { tools } = await sesion.cliente.listTools();
    const por = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const nombre of HERRAMIENTAS_ESCRITURA) {
      expect(por[nombre]?.description, nombre).toContain('ATENCIÓN: la API key es de producción');
    }
    // Los eventos no consumen numeración: la advertencia de emisión no debe contradecir a nominar_documento.
    expect(por.nominar_documento?.description).not.toContain('consume numeración y cupo');
    expect(sesion.cliente.getInstructions()).toContain('producción');
  });

  it('testEscrituraEnSandboxNoRegistraEventos', async () => {
    sesion = await conectar({ escritura: true, apiKey: 'sk_sandbox_abc' });
    const { tools } = await sesion.cliente.listTools();
    const por = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(por.emitir_documento?.description).toContain('no se envía a SIFEN');
    expect(por.emitir_documento?.description).not.toContain('ATENCIÓN');
    for (const nombre of HERRAMIENTAS_EVENTOS) expect(por[nombre], nombre).toBeUndefined();
    expect(sesion.cliente.getInstructions()).toContain('sk_test_ o sk_live_');
  });

  it('testInstruccionesSinEscrituraExplicanComoHabilitarla', async () => {
    sesion = await conectar();
    const instrucciones = sesion.cliente.getInstructions();
    expect(instrucciones).toContain('pruebas con SIFEN');
    expect(instrucciones).toContain('SIFENDE_MCP_ALLOW_WRITE=true');
    expect(instrucciones).toContain('siguientePaso');
  });

  it('testEscrituraDeshabilitadaNoSePuedeLlamar', async () => {
    sesion = await conectar();
    await expect(sesion.llamar('emitir_documento', {})).resolves.toMatchObject({ isError: true });
    expect(sesion.solicitud).not.toHaveBeenCalled();
  });

  it('testInformacionServidorIndicaAmbienteYEscritura', async () => {
    sesion = await conectar({ apiKey: 'sk_live_abc' });
    const datos = datosDe(await sesion.llamar('informacion_servidor'));
    expect(datos).toMatchObject({ ambiente: 'PROD', validezFiscal: true, escrituraHabilitada: false });
    expect(sesion.solicitud).not.toHaveBeenCalled();
  });
});

describe('recursos', () => {
  it('testListaRecursosYEjemplos', async () => {
    sesion = await conectar();
    const { resources } = await sesion.cliente.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('sifende://guia/rapida');
    expect(uris).toContain('sifende://docs/llms.txt');
    expect(uris).toContain('sifende://ejemplos/factura_contado_b2c');
  });

  it('testLeeGuiaRapida', async () => {
    sesion = await conectar();
    const { contents } = await sesion.cliente.readResource({ uri: 'sifende://guia/rapida' });
    expect(contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    expect(JSON.stringify(contents[0])).toContain('listar_enumeraciones');
  });

  it('testLeeEjemploComoJson', async () => {
    sesion = await conectar();
    const { contents } = await sesion.cliente.readResource({ uri: 'sifende://ejemplos/nota_credito' });
    const documento = JSON.parse((contents[0] as { text: string }).text);
    expect(documento.tipoDocumento).toBe('NOTA_DE_CREDITO_ELECTRONICA');
  });

  it('testLlmsTxtSeDescargaDeLaDocumentacion', async () => {
    const { vi } = await import('vitest');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('# Sifende Docs'));
    sesion = await conectar({ fetch });
    const { contents } = await sesion.cliente.readResource({ uri: 'sifende://docs/llms.txt' });
    expect((contents[0] as { text: string }).text).toBe('# Sifende Docs');
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://www.sifende.com.py/llms.txt');
  });
});
