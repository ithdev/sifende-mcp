const CDC_EJEMPLO = '01800000000001001000000012026050912345678901';

const ITEM = {
  codigo: 'PROD-001',
  descripcion: 'Servicio de consultoría',
  unidadMedida: 'UNI',
  cantidad: 1,
  precioUnitario: 100000,
  tasaIVA: 10,
  afectacionTributaria: 'GRAVADO',
};

const RECEPTOR_B2C = {
  tipoContribuyente: 'NO_CONTRIBUYENTE',
  tipoOperacion: 'B2C',
  tipoDocumento: 'CEDULA_PARAGUAYA',
  numeroDocumento: '1234567',
  nombreRazonSocial: 'JUAN PEREZ',
};

const RECEPTOR_B2B = {
  tipoContribuyente: 'CONTRIBUYENTE',
  tipoOperacion: 'B2B',
  tipoContribuyenteReceptor: 'PERSONA_JURIDICA',
  numeroDocumento: '80012345',
  digitoVerificador: '0',
  nombreRazonSocial: 'Comercial San Roque S.A.',
};

const BASE = { tipoEmision: 'NORMAL', numeroEstablecimiento: 1, puntoExpedicion: 1, monedaOperacion: 'PYG' };

export const EJEMPLOS = {
  factura_contado_b2c: {
    descripcion: 'Factura al contado a un consumidor final identificado con cédula (B2C). Total: 100.000 Gs.',
    documento: {
      tipoDocumento: 'FACTURA_ELECTRONICA',
      ...BASE,
      tipoTransaccion: 'VENTA_MERCADERIA',
      condicionOperacion: 'CONTADO',
      condicionPago: { tipo: 'CONTADO', tipoPago: 'EFECTIVO', monedaPago: 'PYG', montoPago: 100000 },
      receptor: RECEPTOR_B2C,
      items: [ITEM],
    },
  },
  factura_contado_b2b: {
    descripcion: 'Factura al contado a una empresa con RUC (B2B).',
    documento: {
      tipoDocumento: 'FACTURA_ELECTRONICA',
      ...BASE,
      tipoTransaccion: 'PRESTACION_SERVICIOS',
      condicionOperacion: 'CONTADO',
      condicionPago: { tipo: 'CONTADO', tipoPago: 'TRANSFERENCIA', monedaPago: 'PYG', montoPago: 100000 },
      receptor: RECEPTOR_B2B,
      items: [ITEM],
    },
  },
  factura_credito_cuotas: {
    descripcion:
      'Factura a crédito en 3 cuotas con entrega inicial. Total 120.000 Gs: entrega 20.000 más cuotas 40.000 + 30.000 + 30.000.',
    documento: {
      tipoDocumento: 'FACTURA_ELECTRONICA',
      ...BASE,
      tipoTransaccion: 'VENTA_MERCADERIA',
      condicionOperacion: 'CREDITO',
      condicionPago: {
        tipo: 'CREDITO',
        condicionCredito: 'CUOTA',
        cuotas: 3,
        detalleCuotas: [
          { monto: 40000, fechaVencimiento: '2026-11-18' },
          { monto: 30000, fechaVencimiento: '2026-12-18' },
          { monto: 30000, fechaVencimiento: '2027-01-18' },
        ],
        tipoPago: 'TRANSFERENCIA',
        monedaPago: 'PYG',
        montoEntregaInicial: 20000,
      },
      receptor: RECEPTOR_B2B,
      items: [{ ...ITEM, descripcion: 'Resma de papel A4 75g', cantidad: 10, precioUnitario: 12000 }],
    },
  },
  nota_credito: {
    descripcion: `Nota de crédito por devolución. Reemplazá el CDC de documentoAsociado ("${CDC_EJEMPLO}" es ficticio) por el de la factura que se corrige.`,
    documento: {
      tipoDocumento: 'NOTA_DE_CREDITO_ELECTRONICA',
      ...BASE,
      motivoEmision: 'DEVOLUCION',
      documentoAsociado: { tipoDocumento: 'ELECTRONICO', cdc: CDC_EJEMPLO },
      receptor: RECEPTOR_B2C,
      items: [{ ...ITEM, descripcion: 'Servicio de consultoría (devolución)' }],
    },
  },
  nota_debito: {
    descripcion: `Nota de débito por ajuste de precio. Reemplazá el CDC de documentoAsociado ("${CDC_EJEMPLO}" es ficticio) por el de la factura que se ajusta.`,
    documento: {
      tipoDocumento: 'NOTA_DE_DEBITO_ELECTRONICA',
      ...BASE,
      motivoEmision: 'AJUSTE_DE_PRECIO',
      documentoAsociado: { tipoDocumento: 'ELECTRONICO', cdc: CDC_EJEMPLO },
      receptor: RECEPTOR_B2C,
      items: [{ ...ITEM, descripcion: 'Ajuste de precio - Servicio de consultoría', precioUnitario: 20000 }],
    },
  },
} as const;

export type NombreEjemplo = keyof typeof EJEMPLOS;
export const NOMBRES_EJEMPLO = Object.keys(EJEMPLOS) as [NombreEjemplo, ...NombreEjemplo[]];

export const DOCS_MODELOS = {
  FACTURA_ELECTRONICA: 'https://www.sifende.com.py/docs/referencia/modelos/factura-electronica',
  NOTA_DE_CREDITO_ELECTRONICA: 'https://www.sifende.com.py/docs/referencia/modelos/nota-credito',
  NOTA_DE_DEBITO_ELECTRONICA: 'https://www.sifende.com.py/docs/referencia/modelos/nota-debito',
  NOTA_DE_REMISION_ELECTRONICA: 'https://www.sifende.com.py/docs/referencia/modelos/nota-remision',
  AUTOFACTURA_ELECTRONICA: 'https://www.sifende.com.py/docs/referencia/modelos/autofactura',
} as const;
