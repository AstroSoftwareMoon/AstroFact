//! Envoltorio nativo de AstroFact (Tauri 2).
//! Fase 2: la lógica fiscal y los datos viven en el WebView (fiscal-core + SQLite/wasm, persistido
//! en el almacenamiento de la app, sin red). Fase 5 añadirá aquí el cliente HTTPS con certificado
//! (mTLS) para el servicio SOAP de la AEAT y el acceso al almacén de certificados del sistema.
//! Cero telemetría: sin analítica. El actualizador solo contacta con GitHub Releases si el usuario
//! lo permite, y verifica la firma minisign de cada actualización antes de instalarla.

#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Actualizaciones firmadas (minisign) desde GitHub Releases, solo en escritorio.
    // La comprobación solo se hace si el usuario la tiene activada en Ajustes.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    builder
        .invoke_handler(tauri::generate_handler![version])
        .run(tauri::generate_context!())
        .expect("error al iniciar AstroFact");
}
