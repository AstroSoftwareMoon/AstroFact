/** Textos de la interfaz (ES/EN). Los textos legales obligatorios (p. ej. «QR tributario:») no se traducen. */
export type Idioma = "es" | "en";
const es = {
  "nav.panel": "Panel", "nav.facturas": "Facturas", "nav.nueva": "Nueva", "nav.clientes": "Clientes", "nav.productos": "Productos",
  "nav.registro": "Registro fiscal", "nav.ajustes": "Ajustes",
  "w.bienvenida": "Te damos la bienvenida a AstroFact", "w.sub": "Facturación libre para autónomos y pymes. Tus datos se quedan contigo.",
  "w.idioma": "Idioma", "w.modoUso": "¿Dónde guardamos tus datos?", "w.local": "En este dispositivo", "w.localD": "Sin cuenta ni servidor. Puedes cifrar los datos con una contraseña.",
  "w.servidor": "En mi servidor", "w.servidorD": "Servidor Docker propio con varios usuarios y envío automático. Disponible en la fase 5.",
  "w.negocio": "Datos de tu negocio", "w.modalidad": "Modalidad del sistema de facturación", "w.serie": "Serie de facturación", "w.cert": "Certificado electrónico",
  "w.seguridad": "Protección de los datos", "w.listo": "¡Todo listo!",
  "comun.siguiente": "Siguiente", "comun.atras": "Atrás", "comun.guardar": "Guardar", "comun.cancelar": "Cancelar", "comun.buscar": "Buscar…",
  "comun.nuevo": "Nuevo", "comun.editar": "Editar", "comun.cerrar": "Cerrar", "comun.empezar": "Empezar",
};
const en: Record<keyof typeof es, string> = {
  "nav.panel": "Dashboard", "nav.facturas": "Invoices", "nav.nueva": "New", "nav.clientes": "Clients", "nav.productos": "Products",
  "nav.registro": "Tax records", "nav.ajustes": "Settings",
  "w.bienvenida": "Welcome to AstroFact", "w.sub": "Free invoicing for freelancers and SMEs in Spain. Your data stays with you.",
  "w.idioma": "Language", "w.modoUso": "Where should we keep your data?", "w.local": "On this device", "w.localD": "No account, no server. You can encrypt your data with a password.",
  "w.servidor": "On my server", "w.servidorD": "Your own Docker server with several users and automatic submission. Coming in phase 5.",
  "w.negocio": "Your business", "w.modalidad": "Invoicing system mode", "w.serie": "Invoice series", "w.cert": "Electronic certificate",
  "w.seguridad": "Data protection", "w.listo": "All set!",
  "comun.siguiente": "Next", "comun.atras": "Back", "comun.guardar": "Save", "comun.cancelar": "Cancel", "comun.buscar": "Search…",
  "comun.nuevo": "New", "comun.editar": "Edit", "comun.cerrar": "Close", "comun.empezar": "Get started",
};
export type Clave = keyof typeof es;
export const textos: Record<Idioma, Record<Clave, string>> = { es, en };
