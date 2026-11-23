#!/usr/bin/env bash
# Descarga la documentación oficial de la AEAT/BOE y compara con docs/normativa/SHA256SUMS.
# Uso: bash scripts/fetch-normativa.sh [directorio_destino]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$(mktemp -d)}"
mkdir -p "$DEST"
DEV=https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU
WS=https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws
get() { curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 -o "$DEST/$(basename "$1")" "$1"; }
for f in Veri-Factu_especificaciones_huella_hash_registros.pdf DetalleEspecificacTecnCodigoQRfactura.pdf \
         Veri-Factu_Descripcion_SWeb.pdf Validaciones_Errores_Veri-Factu.pdf DsRegistroVeriFactu.xlsx \
         FAQs-Desarrolladores.pdf EjemplosDeclaracionResponsable.pdf Descripcion_ServicioWeb_ValidacionNoVerifactu.pdf \
         Espec-Tecnicas/EspecTecGenerFirmaElectRfact.pdf Espec-Tecnicas/AnexosEjemplosFirmaRegFact.zip; do get "$DEV/$f"; done
for f in SuministroLR.xsd SuministroInformacion.xsd RespuestaSuministro.xsd ConsultaLR.xsd RespuestaConsultaLR.xsd \
         EventosSIF.xsd RespuestaValRegistNoVeriFactu.xsd SistemaFacturacion.wsdl; do get "$WS/$f"; done
curl -fsSL --retry 5 -o "$DEST/BOE-A-2023-24840.pdf" https://www.boe.es/buscar/pdf/2023/BOE-A-2023-24840-consolidado.pdf
curl -fsSL --retry 5 -o "$DEST/BOE-A-2024-22138.pdf" https://www.boe.es/buscar/pdf/2024/BOE-A-2024-22138-consolidado.pdf
echo "Descargado en $DEST. Comparando hashes…"
cd "$DEST" && sha256sum -c "$ROOT/docs/normativa/SHA256SUMS" || {
  echo "⚠️  Algún documento ha cambiado: revisa su control de versiones y actualiza AstroFact."; exit 1; }
