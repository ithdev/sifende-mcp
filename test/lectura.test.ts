import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conectar, datosDe, json, pdf, textoDe } from './ayudas.js';

const CDC = '01800123451001001000000122026042710000000006';

let sesion: Awaited<ReturnType<typeof conectar>> | undefined;
afterEach(async () => sesion?.cerrar());

function mockFetch(respuesta: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => respuesta());
}

describe('consultar_documento', () => {
  it('testConsultarDocumentoDevuelveEstado', async () => {
    const fetch = mockFetch(() => json({ cdc: CDC, estado: 'APROBADO', protocoloAutorizacion: '123' }));
    sesion = await conectar({ fetch });

    const datos = datosDe(await sesion.llamar('consultar_documento', { cdc: CDC }));

    expect(datos).toMatchObject({ cdc: CDC, estado: 'APROBADO' });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.sifende.com.py/api/v1/documento-electronico/status/${CDC}`);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk_test_clave-de-prueba');
  });

  it('testConsultarDocumentoRechazaCdcInvalido', async () => {
    const fetch = mockFetch(() => json({}));
    sesion = await conectar({ fetch });

    const resultado = await sesion.llamar('consultar_documento', { cdc: '123' });

    expect(resultado.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testErrorProblemDetailSeVuelveLegible', async () => {
    const fetch = mockFetch(() =>
      json(
        {
          type: 'https://www.sifende.com.py/docs/solucion-problemas/documento-electronico-not-found',
          title: 'Documento no encontrado',
          status: 404,
          detail: `No existe el CDC ${CDC}`,
          traceId: 'abc-123',
        },
        { status: 404, problema: true },
      ),
    );
    sesion = await conectar({ fetch });

    const resultado = await sesion.llamar('consultar_documento', { cdc: CDC });

    expect(resultado.isError).toBe(true);
    const texto = textoDe(resultado);
    expect(texto).toContain('Error 404 (documento-electronico-not-found): Documento no encontrado');
    expect(texto).toContain('traceId: abc-123');
    expect(texto).toContain('Documentación: https://www.sifende.com.py/docs/solucion-problemas/');
  });

  it('testError401PideRevisarLaApiKey', async () => {
    sesion = await conectar({ fetch: mockFetch(() => json({ error: 'Invalid or expired API key' }, { status: 401 })) });
    const texto = textoDe(await sesion.llamar('consultar_documento', { cdc: CDC }));
    expect(texto).toContain('SIFENDE_API_KEY');
  });
});

describe('descargar_kude', () => {
  const directorio = join('/tmp', `sifende-mcp-kude-${process.pid}`);
  afterEach(() => rmSync(directorio, { recursive: true, force: true }));

  it('testDescargarKudeGuardaElPdf', async () => {
    sesion = await conectar({ fetch: mockFetch(pdf), directorioKude: directorio });

    const datos = datosDe(await sesion.llamar('descargar_kude', { cdc: CDC }));

    const archivo = join(directorio, `kude-${CDC}.pdf`);
    expect(datos).toMatchObject({ cdc: CDC, archivo });
    expect(readFileSync(archivo, 'latin1')).toContain('%PDF-1.7');
  });

  it('testDescargarKudeIncluyeBase64SoloSiSePide', async () => {
    sesion = await conectar({ fetch: mockFetch(pdf), directorioKude: directorio });

    const sin = await sesion.llamar('descargar_kude', { cdc: CDC });
    const con = await sesion.llamar('descargar_kude', { cdc: CDC, incluirBase64: true });

    expect(sin.content).toHaveLength(1);
    expect(con.content).toHaveLength(2);
    expect(con.content[1]).toMatchObject({ type: 'resource', resource: { mimeType: 'application/pdf' } });
  });

  it('testDescargarKudePendienteAvisaParaReintentar', async () => {
    sesion = await conectar({
      fetch: mockFetch(() => json({ estado: 'PREPARANDO' }, { status: 202, headers: { 'retry-after': '30' } })),
      directorioKude: directorio,
    });

    const resultado = await sesion.llamar('descargar_kude', { cdc: CDC, esperarSegundos: 1 });

    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain('sigue en preparación');
    expect(existsSync(join(directorio, `kude-${CDC}.pdf`))).toBe(false);
  });

  it('testDescargarKudeRechazaRespuestaQueNoEsPdf', async () => {
    sesion = await conectar({
      fetch: mockFetch(() => new Response('<html>', { headers: { 'content-type': 'application/pdf' } })),
      directorioKude: directorio,
    });
    expect(textoDe(await sesion.llamar('descargar_kude', { cdc: CDC }))).toContain('no es un PDF');
  });
});

describe('catálogos y consultas', () => {
  it('testConsultarPadronNoEncontrado', async () => {
    sesion = await conectar({ fetch: mockFetch(() => json({})) });
    expect(datosDe(await sesion.llamar('consultar_padron', { documento: '80012345-0' }))).toEqual({
      encontrado: false,
      documento: '80012345-0',
    });
  });

  it('testConsultarPadronEncontrado', async () => {
    const fetch = mockFetch(() => json({ data: { numeroDocumento: '80012345', nombreRazonSocial: 'ACME SA' } }));
    sesion = await conectar({ fetch });
    const datos = datosDe(await sesion.llamar('consultar_padron', { documento: '80012345-0' }));
    expect(datos.nombreRazonSocial).toBe('ACME SA');
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/v1/padron/80012345-0');
  });

  it('testListarEnumeracionesSinNombreListaLosNombres', async () => {
    const fetch = mockFetch(() =>
      json({ tipoPago: [{ name: 'EFECTIVO', val: 1 }], unidadMedida: [{ name: 'UNI' }, { name: 'kg' }] }),
    );
    sesion = await conectar({ fetch });
    const datos = datosDe(await sesion.llamar('listar_enumeraciones'));
    expect(datos.enumeraciones).toEqual([
      { nombre: 'tipoPago', cantidad: 1 },
      { nombre: 'unidadMedida', cantidad: 2 },
    ]);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
  });

  it('testListarEnumeracionesPorNombreIgnoraMayusculas', async () => {
    sesion = await conectar({ fetch: mockFetch(() => json({ tipoPago: [{ name: 'EFECTIVO', val: 1 }] })) });
    const datos = datosDe(await sesion.llamar('listar_enumeraciones', { nombre: 'TIPOPAGO' }));
    expect(datos).toEqual({ nombre: 'tipoPago', valores: [{ name: 'EFECTIVO', val: 1 }] });
  });

  it('testListarEnumeracionesInexistenteListaLasDisponibles', async () => {
    sesion = await conectar({ fetch: mockFetch(() => json({ tipoPago: [] })) });
    const resultado = await sesion.llamar('listar_enumeraciones', { nombre: 'inventada' });
    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain('tipoPago');
  });

  it('testGeografiaPorNivel', async () => {
    const fetch = mockFetch(() => json({ data: [{ codigo: 1, nombre: 'CAPITAL' }] }));
    sesion = await conectar({ fetch });

    await sesion.llamar('consultar_geografia', { nivel: 'departamentos' });
    await sesion.llamar('consultar_geografia', { nivel: 'distritos', id: 11 });
    await sesion.llamar('consultar_geografia', { nivel: 'ciudades', id: 7 });

    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/v1/geografia/departamentos',
      '/api/v1/geografia/departamentos/11/distritos',
      '/api/v1/geografia/distritos/7/ciudades',
    ]);
  });

  it('testGeografiaExigeIdParaDistritos', async () => {
    const fetch = mockFetch(() => json({ data: [] }));
    sesion = await conectar({ fetch });
    const resultado = await sesion.llamar('consultar_geografia', { nivel: 'distritos' });
    expect(resultado.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testListarEventosEnviaPaginacionYFiltro', async () => {
    const fetch = mockFetch(() => json({ content: [], page: 1, size: 5, totalElements: 0, totalPages: 0 }));
    sesion = await conectar({ fetch });
    await sesion.llamar('listar_eventos', { pagina: 1, tamanio: 5, tipoEvento: 'CANCELACION' });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/documento-electronico/eventos');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '1', size: '5', tipoEvento: 'CANCELACION' });
  });

  it('testConsultarEventoYContribuyenteYPlan', async () => {
    const fetch = mockFetch(() => json({ ok: true }));
    sesion = await conectar({ fetch });
    await sesion.llamar('consultar_evento', { eventoId: 9 });
    await sesion.llamar('consultar_contribuyente');
    await sesion.llamar('consultar_consumo_plan');
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/v1/documento-electronico/eventos/9',
      '/api/v1/contribuyente',
      '/api/v1/contribuyente/plan-consumo',
    ]);
  });
});

describe('herramientas locales', () => {
  it('testCalcularTotalesAplicaRedondeoOficial', async () => {
    const fetch = mockFetch(() => json({}));
    sesion = await conectar({ fetch });

    const datos = datosDe(
      await sesion.llamar('calcular_totales', {
        items: [{ precioUnitario: 12345, cantidad: 1, afectacionTributaria: 'GRAVADO', tasaIVA: 10 }],
      }),
    );

    expect(datos).toMatchObject({ totalOperacion: 12345, redondeo: 45, totalGeneral: 12300 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testCalcularTotalesRechazaAfectacionInventada', async () => {
    sesion = await conectar();
    const resultado = await sesion.llamar('calcular_totales', {
      items: [{ precioUnitario: 1000, cantidad: 1, afectacionTributaria: 'INVENTADA' }],
    });
    expect(resultado.isError).toBe(true);
  });

  it('testCalcularTotalesFueraDePygSinTipoCambioInformaElError', async () => {
    sesion = await conectar();
    const resultado = await sesion.llamar('calcular_totales', {
      monedaOperacion: 'USD',
      items: [{ precioUnitario: 10, cantidad: 1, afectacionTributaria: 'GRAVADO', tasaIVA: 10 }],
    });
    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain('tipoCambio');
  });

  it('testObtenerEjemploDevuelveDocumento', async () => {
    sesion = await conectar();
    const datos = datosDe(await sesion.llamar('obtener_ejemplo_documento', { ejemplo: 'factura_credito_cuotas' }));
    expect(datos.documento).toMatchObject({ tipoDocumento: 'FACTURA_ELECTRONICA', condicionOperacion: 'CREDITO' });
  });

  it('testObtenerEjemploRemisionApuntaALaDocumentacion', async () => {
    sesion = await conectar();
    const datos = datosDe(await sesion.llamar('obtener_ejemplo_documento', { ejemplo: 'nota_remision' }));
    expect(datos.documentacion).toContain('/docs/referencia/modelos/nota-remision');
  });
});
