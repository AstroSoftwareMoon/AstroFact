# Gestión comercial e informes

Funciones de la fase 6. Ninguna de ellas altera los registros de facturación: solo las **facturas emitidas**
generan registros encadenados (y, en VERI\*FACTU, envíos a la AEAT).

## Presupuestos, albaranes y borradores
- **Presupuestos** (`P-AAAA-NNNN`): estados abierto → enviado → aceptado/rechazado. Se convierten en albarán o en factura con un clic.
- **Albaranes** (`AL-AAAA-NNNN`): marca varios del mismo cliente y pulsa «Facturar juntos»; cada línea indica de qué albarán procede.
- **Borradores** (`B-AAAA-NNNN`): facturas a medio preparar, sin número fiscal ni registro. «Revisar y emitir» abre el editor normal.
- Un documento facturado queda enlazado a su factura y ya no se puede modificar.

## Facturas recurrentes
Plantillas mensuales, trimestrales, semestrales o anuales. En cada vencimiento se **emite** la factura (si activas
«Emitir automáticamente») o se crea un **borrador** para revisarlo. La factura se expide con la fecha del día en que se
procesa — nunca con fecha futura. En modo local se procesan al abrir la app y cada hora; en modo servidor, el servidor
lo hace cada minuto.

## Gastos
Facturas recibidas y tickets: proveedor, NIF, varios tipos de IVA, recargo de equivalencia, retención soportada,
porcentaje deducible (afectación) e inversión del sujeto pasivo. Admite adjuntos (PDF, imágenes, XML; máx. 10 MB) con
huella SHA-256. En modo servidor los adjuntos **no** viajan en la réplica: se descargan bajo demanda.

## Cobros, impagos y conciliación
- Cobros parciales o totales por factura; el estado (pendiente/parcial/cobrada) se recalcula solo.
- Facturas vencidas (vencimiento o 30 días por defecto) con recordatorio por email o WhatsApp; queda constancia de cada aviso.
- Conciliación: importa el extracto del banco (CSV o Excel con columnas de fecha, concepto e importe o cargo/abono).
  Se descartan duplicados y se sugieren coincidencias por importe pendiente (confianza alta si el concepto contiene el
  número de factura).

## Informes (ayuda orientativa)
- Libros de facturas emitidas y recibidas, ventas por cliente y por mes.
- **Resumen de IVA** (para preparar el modelo 303) y **pago fraccionado del IRPF** (modelo 130, art. 110 RIRPF; 5 % de
  gastos de difícil justificación con tope de 2.000 € en directa simplificada). No se presentan ni se asignan
  casillas: revisa el modelo oficial vigente. No contempla criterio de caja ([TODO #15](TODO-normativa.md)).
- Exportación a Excel (.xlsx) y CSV (separador `;`, coma decimal, UTF-8 con BOM).
- **Paquete para el gestor**: ZIP con los libros, los resúmenes, los PDF de las facturas, los justificantes de gastos y
  los registros de facturación del periodo (la exportación queda anotada como evento en No VERI\*FACTU).

## Importación
Clientes y productos desde CSV o Excel. Se reconocen cabeceras habituales (Razón social, CIF/NIF, E-mail, C.P.,
Población, PVP, % IVA…), se validan los NIF y no se duplican los ya existentes. Descarga la plantilla desde la propia página.

## Facturae 3.2.2 (opcional)
Actívalo en **Ajustes → Preferencias → Módulos opcionales**. Desde cada factura se descarga el XML Facturae 3.2.2,
validado en los tests contra el [esquema oficial](normativa/facturae/README.md). Se genera **sin firmar**: fírmalo con
AutoFirma u otra herramienta antes de presentarlo en FACe ([TODO #14](TODO-normativa.md)). Para Administraciones
Públicas hacen falta los códigos DIR3 del destinatario (de momento solo en la API: `generarFacturae(..., { dir3 })`).
