/**
 * Constantes oficiales. Fuentes (ver /docs/normativa/README.md):
 *  - Listas L1–L17, L1E–L4E: "DsRegistroVeriFactu.xlsx" v1.0 (28/10/2024), hoja "6)Listas".
 *  - Espacios de nombres: XSD oficiales (SuministroLR.xsd, SuministroInformacion.xsd, EventosSIF.xsd).
 *  - Endpoints: SistemaFacturacion.wsdl.
 *  - URLs del QR: "Detalle de las especificaciones técnicas del código QR", v0.5.0 (10/12/2025), apdo. 5.
 */
const BASE_NS = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/";
export const NS = {
  SuministroLR: BASE_NS + "SuministroLR.xsd",
  SuministroInformacion: BASE_NS + "SuministroInformacion.xsd",
  RespuestaSuministro: BASE_NS + "RespuestaSuministro.xsd",
  ConsultaLR: BASE_NS + "ConsultaLR.xsd",
  EventosSIF: BASE_NS + "EventosSIF.xsd",
  soapenv: "http://schemas.xmlsoap.org/soap/envelope/",
  ds: "http://www.w3.org/2000/09/xmldsig#",
} as const;

export const ID_VERSION = "1.0"; // L15

export type Entorno = "pruebas" | "produccion";

/** Endpoints SOAP del servicio VERI*FACTU (WSDL). "sello" = acceso con certificado de sello. */
export const ENDPOINTS = {
  pruebas: {
    verifactu: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    verifactuSello: "https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    requerimiento: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/RequerimientoSOAP",
    requerimientoSello: "https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/RequerimientoSOAP",
  },
  produccion: {
    verifactu: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    verifactuSello: "https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    requerimiento: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/RequerimientoSOAP",
    requerimientoSello: "https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/RequerimientoSOAP",
  },
} as const;

/** URL base del servicio de cotejo del QR (sin parámetros). */
export const QR_BASE_URL = {
  pruebas: { verifactu: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR", noVerifactu: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu" },
  produccion: { verifactu: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR", noVerifactu: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu" },
} as const;

/** L1 Impuesto */
export const IMPUESTO = { "01": "IVA", "02": "IPSI (Ceuta y Melilla)", "03": "IGIC", "05": "Otros" } as const;
export type Impuesto = keyof typeof IMPUESTO;

/** L2 TipoFactura */
export const TIPO_FACTURA = {
  F1: "Factura (art. 6, 7.2 y 7.3 del RD 1619/2012)",
  F2: "Factura simplificada y facturas sin identificación del destinatario art. 6.1.d) RD 1619/2012",
  F3: "Factura emitida en sustitución de facturas simplificadas facturadas y declaradas",
  R1: "Factura rectificativa (error fundado en derecho y art. 80 Uno, Dos y Seis LIVA)",
  R2: "Factura rectificativa (art. 80.3)",
  R3: "Factura rectificativa (art. 80.4)",
  R4: "Factura rectificativa (resto)",
  R5: "Factura rectificativa en facturas simplificadas",
} as const;
export type TipoFactura = keyof typeof TIPO_FACTURA;
export const TIPOS_RECTIFICATIVA: TipoFactura[] = ["R1", "R2", "R3", "R4", "R5"];

/** L3 TipoRectificativa */
export const TIPO_RECTIFICATIVA = { S: "Por sustitución", I: "Por diferencias" } as const;
export type TipoRectificativa = keyof typeof TIPO_RECTIFICATIVA;

/** L7 IDType */
export const ID_TYPE = {
  "02": "NIF-IVA", "03": "Pasaporte", "04": "Documento oficial de identificación expedido por el país o territorio de residencia",
  "05": "Certificado de residencia", "06": "Otro documento probatorio", "07": "No censado",
} as const;
export type IdType = keyof typeof ID_TYPE;

/** L8A ClaveRegimen (IVA) */
export const CLAVE_REGIMEN_IVA = {
  "01": "Operación de régimen general", "02": "Exportación",
  "03": "Régimen especial de bienes usados, objetos de arte, antigüedades y objetos de colección",
  "04": "Régimen especial del oro de inversión", "05": "Régimen especial de las agencias de viajes",
  "06": "Régimen especial grupo de entidades en IVA (nivel avanzado)", "07": "Régimen especial del criterio de caja",
  "08": "Operaciones sujetas al IPSI / IGIC",
  "09": "Facturación de servicios de agencias de viaje mediadoras (D.A. 4ª RD 1619/2012)",
  "10": "Cobros por cuenta de terceros de honorarios profesionales o derechos",
  "11": "Operaciones de arrendamiento de local de negocio",
  "14": "IVA pendiente de devengo en certificaciones de obra a Administración Pública",
  "15": "IVA pendiente de devengo en operaciones de tracto sucesivo",
  "17": "Regímenes del Capítulo XI del Título IX (OSS e IOSS)", "18": "Recargo de equivalencia",
  "19": "Régimen especial de agricultura, ganadería y pesca (REAGYP)", "20": "Régimen simplificado",
} as const;
/** L8B ClaveRegimen (IGIC) */
export const CLAVE_REGIMEN_IGIC = {
  "01": "Operación de régimen general", "02": "Exportación",
  "03": "Régimen especial de bienes usados, objetos de arte, antigüedades y objetos de colección",
  "04": "Régimen especial del oro de inversión", "05": "Régimen especial de las agencias de viajes",
  "06": "Régimen especial grupo de entidades en IGIC (nivel avanzado)", "07": "Régimen especial del criterio de caja",
  "08": "Operaciones sujetas al IPSI / IVA",
  "09": "Facturación de servicios de agencias de viaje mediadoras (D.A. 4ª RD 1619/2012)",
  "10": "Cobros por cuenta de terceros de honorarios profesionales o derechos",
  "11": "Operaciones de arrendamiento de local de negocio",
  "14": "IGIC pendiente de devengo en certificaciones de obra a Administración Pública",
  "15": "IGIC pendiente de devengo en operaciones de tracto sucesivo",
  "17": "Régimen especial de comerciante minorista", "18": "Régimen especial del pequeño empresario o profesional",
  "19": "Operaciones interiores exentas por aplicación artículo 25 Ley 19/1994",
} as const;
export type ClaveRegimen = keyof typeof CLAVE_REGIMEN_IVA | "20" | "21";

/** L9 CalificacionOperacion */
export const CALIFICACION = {
  S1: "Sujeta y no exenta — sin inversión del sujeto pasivo",
  S2: "Sujeta y no exenta — con inversión del sujeto pasivo",
  N1: "No sujeta (artículos 7, 14, otros)",
  N2: "No sujeta por reglas de localización",
} as const;
export type Calificacion = keyof typeof CALIFICACION;

/** L10 OperacionExenta (E7/E8 solo IGIC según "Validaciones y errores" 15.5 y XSD) */
export const OPERACION_EXENTA = {
  E1: "Exenta por el artículo 20", E2: "Exenta por el artículo 21", E3: "Exenta por el artículo 22",
  E4: "Exenta por los artículos 23 y 24", E5: "Exenta por el artículo 25", E6: "Exenta por otros",
  E7: "Exenta (IGIC, valor adicional)", E8: "Exenta (IGIC, valor adicional)",
} as const;
export type OperacionExenta = keyof typeof OPERACION_EXENTA;

/** Tipos de IVA admitidos con S1 (Validaciones 15.1) y recargos (15.3). */
export const TIPOS_IVA_ADMITIDOS = ["0", "2", "4", "5", "7.5", "10", "21"] as const;
export const RECARGO_POR_TIPO_IVA: Record<string, string[]> = {
  "21": ["5.2", "1.75"], "10": ["1.4"], "7.5": ["1"], "5": ["0.5", "0.62"], "4": ["0.5"], "2": ["0.26"], "0": ["0"],
};

/** L1E TipoAnomalia */
export const TIPO_ANOMALIA = {
  "01": "Integridad-huella",
  "02": "Integridad-firma",
  "03": "Integridad - Otros",
  "04": "Trazabilidad-cadena-registro - Reg. no primero pero con reg. anterior no anotado o inexistente",
  "05": "Trazabilidad-cadena-registro - Reg. no último pero con reg. posterior no anotado o inexistente",
  "06": "Trazabilidad-cadena-registro - Otros",
  "07": "Trazabilidad-cadena-huella - Huella del reg. no se corresponde con la 'huella del reg. anterior' almacenada en el registro posterior",
  "08": "Trazabilidad-cadena-huella - Campo 'huella del reg. anterior' no se corresponde con la huella del reg. anterior",
  "09": "Trazabilidad-cadena-huella - Otros",
  "10": "Trazabilidad-cadena - Otros",
  "11": "Trazabilidad-fechas - Fecha-hora anterior a la fecha del reg. anterior",
  "12": "Trazabilidad-fechas - Fecha-hora posterior a la fecha del reg. posterior",
  "13": "Trazabilidad-fechas - Reg. con fecha-hora de generación posterior a la fecha-hora actual del sistema",
  "14": "Trazabilidad-fechas - Otros",
  "15": "Trazabilidad - Otros",
  "90": "Otros",
} as const;
export type TipoAnomalia = keyof typeof TIPO_ANOMALIA;

/** L2E TipoEvento */
export const TIPO_EVENTO = {
  "01": "Inicio del funcionamiento del sistema informático como «NO VERI*FACTU»",
  "02": "Fin del funcionamiento del sistema informático como «NO VERI*FACTU»",
  "03": "Lanzamiento del proceso de detección de anomalías en los registros de facturación",
  "04": "Detección de anomalías en la integridad, inalterabilidad y trazabilidad de registros de facturación",
  "05": "Lanzamiento del proceso de detección de anomalías en los registros de evento",
  "06": "Detección de anomalías en la integridad, inalterabilidad y trazabilidad de registros de evento",
  "07": "Restauración de copia de seguridad",
  "08": "Exportación de registros de facturación generados en un periodo",
  "09": "Exportación de registros de evento generados en un periodo",
  "10": "Registro resumen de eventos",
  "90": "Otros tipos de eventos registrados voluntariamente por el productor",
} as const;
export type TipoEvento = keyof typeof TIPO_EVENTO;

/** Límites oficiales */
export const LIMITES = {
  /** Registros por envío (SuministroLR.xsd: RegistroFactura maxOccurs=1000). */
  registrosPorEnvio: 1000,
  /** Tiempo de espera inicial entre envíos (art. 16.2 Orden). */
  tiempoEsperaInicialSeg: 60,
  /** Tolerancia de las validaciones de cuotas e importes (Validaciones 15.7, 16, 17). */
  toleranciaEuros: "10.00",
  /** Máximo F2 (Validaciones 15.8). */
  maxSimplificadaEuros: "3000.00",
  /** Desfase máximo de reloj (art. 7.f e i Orden). */
  margenRelojSeg: 60,
  /** Registro resumen de eventos cada 6 horas (art. 9.2 Orden). */
  resumenEventosHoras: 6,
  /** Macrodato obligatorio si |ImporteTotal| >= 100.000.000 (Validaciones 10). */
  macrodatoEuros: "100000000.00",
  /** Fecha mínima de expedición admitida por la AEAT (Validaciones 3.1.3.1). */
  fechaExpedicionMinima: "2024-10-28",
} as const;

/**
 * Fechas de obligatoriedad (Disposición final cuarta RD 1007/2023, texto consolidado
 * con última modificación 03/12/2025). CONFIGURABLES: revísense ante cambios normativos.
 */
export const FECHAS_OBLIGATORIEDAD_DEFECTO = {
  contribuyentesIS: "2027-01-01",
  restoObligados: "2027-07-01",
} as const;
