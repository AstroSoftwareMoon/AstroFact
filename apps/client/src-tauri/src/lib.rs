//! Envoltorio nativo de AstroFact (Tauri 2).
//! Fase 2: la lógica fiscal y los datos viven en el WebView (fiscal-core + SQLite/wasm, persistido
//! en el almacenamiento de la app, sin red). Fase 5 añadirá aquí el cliente HTTPS con certificado
//! (mTLS) para el servicio SOAP de la AEAT y el acceso al almacén de certificados del sistema.
//! Cero telemetría: sin analítica. El actualizador solo contacta con GitHub Releases si el usuario
//! lo permite, y verifica la firma minisign de cada actualización antes de instalarla.

/// Hosts oficiales del servicio VERI*FACTU (WSDL de la AEAT). No se permite ningún otro destino.
#[cfg(desktop)]
const HOSTS_AEAT: [&str; 4] = ["prewww1.aeat.es", "prewww10.aeat.es", "www1.agenciatributaria.gob.es", "www10.agenciatributaria.gob.es"];

#[derive(serde::Serialize)]
struct RespuestaHttp { status: u16, body: String }

/// Envía un mensaje SOAP a la AEAT autenticándose con el certificado del usuario (PKCS#12).
/// El certificado solo vive en memoria durante la llamada.
#[cfg(desktop)]
#[tauri::command]
async fn aeat_enviar(url: String, soap: String, p12_b64: String, password: String) -> Result<RespuestaHttp, String> {
    use base64::Engine;
    let u = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if u.scheme() != "https" || !HOSTS_AEAT.contains(&u.host_str().unwrap_or_default()) {
        return Err(format!("Destino no permitido: {}", u.host_str().unwrap_or_default()));
    }
    let der = base64::engine::general_purpose::STANDARD.decode(p12_b64).map_err(|e| e.to_string())?;
    let identidad = reqwest::Identity::from_pkcs12_der(&der, &password).map_err(|e| format!("Certificado no válido: {e}"))?;
    let cliente = reqwest::Client::builder()
        .identity(identidad)
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let r = cliente.post(u).header("Content-Type", "text/xml; charset=UTF-8").header("SOAPAction", "\"\"").body(soap)
        .send().await.map_err(|e| format!("Error de conexión: {e}"))?;
    let status = r.status().as_u16();
    let body = r.text().await.map_err(|e| e.to_string())?;
    Ok(RespuestaHttp { status, body })
}

#[cfg(mobile)]
#[tauri::command]
async fn aeat_enviar(_url: String, _soap: String, _p12_b64: String, _password: String) -> Result<RespuestaHttp, String> {
    // TODO: VERI*FACTU local en Android/iOS (TLS con certificado de cliente). Mientras, usar el modo servidor.
    Err("El envío VERI*FACTU desde el móvil requiere el modo servidor".into())
}

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
        .invoke_handler(tauri::generate_handler![version, aeat_enviar])
        .run(tauri::generate_context!())
        .expect("error al iniciar AstroFact");
}
