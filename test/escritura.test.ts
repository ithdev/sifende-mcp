import { afterEach, describe, expect, it, vi } from 'vitest';
import { EJEMPLOS } from '../src/ejemplos.js';
import { montosNoEnteros } from '../src/tools/escritura.js';
import { conectar, datosDe, json, textoDe } from './ayudas.js';

const CDC = '01800123451001001000000122026042710000000006';
const CLAVE = 'pedido-1001';

let sesion: Awaited<ReturnType<typeof conectar>> | undefined;
afterEach(async () => sesion?.cerrar());

function mockFetch(respuesta: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => respuesta());
}

describe('emitir_documento', () => {
  const emision = { id: 'u-1', cdc: CDC, estado: 'PENDIENTE', ambiente: 'DEV' };

  it('testEmitirEnviaElDocumentoConIdempotencyKey', async () => {
    const fetch = mockFetch(() => json(emision, { status: 202 }));
    sesion = await conectar({ escritura: true, fetch });

    const datos = datosDe(
      await sesion.llamar('emitir_documento', {
        documento: EJEMPLOS.factura_contado_b2c.documento,
        idempotencyKey: CLAVE,
      }),
    );

    expect(datos).toMatchObject({ cdc: CDC, estado: 'PENDIENTE', idempotencyKey: CLAVE });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.sifende.com.py/api/v1/documento-electronico');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(CLAVE);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      tipoDocumento: 'FACTURA_ELECTRONICA',
      tipoEmision: 'NORMAL',
      receptor: { numeroDocumento: '1234567' },
      condicionPago: { montoPago: 100000 },
    });
  });

  it('testEmitirGeneraYDevuelveIdempotencyKeySiNoSePasa', async () => {
    sesion = await conectar({ escritura: true, fetch: mockFetch(() => json(emision, { status: 202 })) });
    const datos = datosDe(
      await sesion.llamar('emitir_documento', { documento: EJEMPLOS.factura_contado_b2c.documento }),
    );
    expect(datos.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('testEmitirAgregaTipoEmisionNormalPorDefecto', async () => {
    const fetch = mockFetch(() => json(emision, { status: 202 }));
    sesion = await conectar({ escritura: true, fetch });
    const { tipoEmision, ...sinTipoEmision } = EJEMPLOS.nota_credito.documento;
    await sesion.llamar('emitir_documento', { documento: sinTipoEmision });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).tipoEmision).toBe(tipoEmision);
  });

  it('testEmitirRechazaTipoDocumentoInventado', async () => {
    const fetch = mockFetch(() => json({}));
    sesion = await conectar({ escritura: true, fetch });
    const resultado = await sesion.llamar('emitir_documento', {
      documento: { ...EJEMPLOS.factura_contado_b2c.documento, tipoDocumento: 'FACTURA' },
    });
    expect(resultado.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testEmitirRechazaMontoConDecimalesEnGuaranies', async () => {
    const fetch = mockFetch(() => json({}));
    sesion = await conectar({ escritura: true, fetch });
    const documento = {
      ...EJEMPLOS.factura_contado_b2c.documento,
      condicionPago: { tipo: 'CONTADO', tipoPago: 'EFECTIVO', monedaPago: 'PYG', montoPago: 99999.5 },
    };

    const resultado = await sesion.llamar('emitir_documento', { documento });

    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain('condicionPago.montoPago = 99999.5');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testEmitirMuestraLosCamposInvalidosDeLaApi', async () => {
    const fetch = mockFetch(() =>
      json(
        {
          type: 'https://www.sifende.com.py/docs/solucion-problemas/validation-error',
          title: 'Error de validación',
          status: 400,
          errores: { 'receptor.digitoVerificador': 'es obligatorio para contribuyentes' },
        },
        { status: 400, problema: true },
      ),
    );
    sesion = await conectar({ escritura: true, fetch });

    const resultado = await sesion.llamar('emitir_documento', { documento: EJEMPLOS.factura_contado_b2b.documento });

    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain('- receptor.digitoVerificador: es obligatorio para contribuyentes');
  });

  it('testEmitirMuestraValoresAceptadosEnErrorDeEnumeracion', async () => {
    sesion = await conectar({
      escritura: true,
      fetch: mockFetch(() =>
        json(
          {
            type: 'https://www.sifende.com.py/docs/solucion-problemas/invalid-enum-value',
            title: 'Valor de enumeración inválido',
            status: 400,
            campo: 'tipoPago',
            valorRecibido: 'PLATA',
            valoresAceptados: ['EFECTIVO', 'TRANSFERENCIA'],
          },
          { status: 400, problema: true },
        ),
      ),
    });
    const texto = textoDe(
      await sesion.llamar('emitir_documento', { documento: EJEMPLOS.factura_contado_b2c.documento }),
    );
    expect(texto).toContain('Valor recibido: PLATA');
    expect(texto).toContain('Valores aceptados: EFECTIVO, TRANSFERENCIA');
  });

  it('testEmitirConCorteDeConexionDevuelveLaClaveParaRecuperarElResultado', async () => {
    sesion = await conectar({
      escritura: true,
      fetch: mockFetch(() => {
        throw new TypeError('fetch failed');
      }),
    });

    const resultado = await sesion.llamar('emitir_documento', {
      documento: EJEMPLOS.factura_contado_b2c.documento,
      idempotencyKey: CLAVE,
    });

    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain(`idempotencyKey="${CLAVE}"`);
  });
});

describe('eventos', () => {
  const evento = { eventoSifenId: 5, estadoEvento: 'APROBADO', cdc: CDC };

  it('testCancelarEnviaMotivoAlCdc', async () => {
    const fetch = mockFetch(() => json(evento));
    sesion = await conectar({ escritura: true, fetch });

    const datos = datosDe(
      await sesion.llamar('cancelar_documento', {
        cdc: CDC,
        motivo: 'Error en datos del cliente',
        idempotencyKey: CLAVE,
      }),
    );

    expect(datos).toMatchObject({ estadoEvento: 'APROBADO', idempotencyKey: CLAVE });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.sifende.com.py/api/v1/documento-electronico/${CDC}/cancelar`);
    expect(JSON.parse(String(init?.body))).toEqual({ motivo: 'Error en datos del cliente' });
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(CLAVE);
  });

  it('testCancelarExigeMotivoYCdcValido', async () => {
    const fetch = mockFetch(() => json(evento));
    sesion = await conectar({ escritura: true, fetch });
    expect((await sesion.llamar('cancelar_documento', { cdc: CDC, motivo: 'no' })).isError).toBe(true);
    expect((await sesion.llamar('cancelar_documento', { cdc: '123', motivo: 'Motivo válido' })).isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testInutilizarEnviaElRango', async () => {
    const fetch = mockFetch(() => json(evento));
    sesion = await conectar({ escritura: true, fetch });
    const rango = {
      numeroTimbrado: 12557896,
      establecimiento: '001',
      puntoExpedicion: '001',
      numeroInicio: '0000025',
      numeroFin: '0000030',
      tipoDocumento: 1,
      motivo: 'Números no utilizados por error de sistema',
    };

    await sesion.llamar('inutilizar_numeracion', rango);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.sifende.com.py/api/v1/documento-electronico/inutilizar');
    expect(JSON.parse(String(init?.body))).toEqual(rango);
  });

  it('testInutilizarRechazaRangoInvertidoSinLlamarALaApi', async () => {
    const fetch = mockFetch(() => json(evento));
    sesion = await conectar({ escritura: true, fetch });
    const resultado = await sesion.llamar('inutilizar_numeracion', {
      numeroTimbrado: 1,
      establecimiento: '001',
      puntoExpedicion: '001',
      numeroInicio: '30',
      numeroFin: '25',
      tipoDocumento: 1,
      motivo: 'Motivo válido',
    });
    expect(resultado.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('testNominarEnviaElReceptorNominado', async () => {
    const fetch = mockFetch(() => json(evento));
    sesion = await conectar({ escritura: true, fetch });
    const receptor = {
      naturaleza: 'NO_CONTRIBUYENTE',
      tipoOperacion: 'B2C',
      pais: 'PRY',
      nombreRazonSocial: 'Juan Pérez',
      tipoDocumento: 'CEDULA_PARAGUAYA',
      numeroDocumento: '1234567',
    };

    await sesion.llamar('nominar_documento', { cdc: CDC, motivo: 'El cliente pidió su factura', receptor });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://api.sifende.com.py/api/v1/documento-electronico/${CDC}/nominar`);
    expect(JSON.parse(String(init?.body))).toEqual({ motivo: 'El cliente pidió su factura', receptor });
  });

  it('testEventoDeSandboxExplicaQueNoEstaSoportado', async () => {
    sesion = await conectar({
      escritura: true,
      apiKey: 'sk_sandbox_abc',
      fetch: mockFetch(() =>
        json(
          {
            type: 'https://www.sifende.com.py/docs/solucion-problemas/sandbox-operation-not-supported',
            title: 'Operación no disponible en SANDBOX',
            status: 422,
          },
          { status: 422, problema: true },
        ),
      ),
    });
    const texto = textoDe(await sesion.llamar('cancelar_documento', { cdc: CDC, motivo: 'Motivo válido' }));
    expect(texto).toContain('sandbox-operation-not-supported');
  });
});

describe('montosNoEnteros', () => {
  it('testMontosNoEnterosIgnoraMonedaExtranjera', () => {
    expect(montosNoEnteros({ monedaOperacion: 'USD', condicionPago: { montoPago: 10.5 } })).toEqual([]);
  });

  it('testMontosNoEnterosRevisaCuotasYPagos', () => {
    const errores = montosNoEnteros({
      condicionPago: { montoEntregaInicial: 1.5, detalleCuotas: [{ monto: 100 }, { monto: 33.3 }] },
      pagos: [{ montoPago: 10.25 }],
    });
    expect(errores).toEqual([
      'condicionPago.montoEntregaInicial = 1.5',
      'condicionPago.detalleCuotas[1].monto = 33.3',
      'pagos[0].montoPago = 10.25',
    ]);
  });
});
