//! Envoltorio nativo de AstroFact (Tauri 2).
//! Fase 2: la lógica fiscal y los datos viven en el WebView (fiscal-core + SQLite/wasm, persistido
//! en el almacenamiento de la app, sin red). Fase 5 añadirá aquí el cliente HTTPS con certificado
//! (mTLS) para el servicio SOAP de la AEAT y el acceso al almacén de certificados del sistema.
//! Cero telemetría: no se registra ningún plugin de analítica ni de actualizaciones automáticas
//! sin consentimiento (el actualizador llegará en la fase 4, verificando firmas).

#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![version])
        .run(tauri::generate_context!())
        .expect("error al iniciar AstroFact");
}
