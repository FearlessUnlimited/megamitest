// Configuración compartida por la landing (index.html) y el panel de pedidos (pedidos.html).
//
// Mientras SUPABASE_URL esté vacío:
//   * la carta se lee de data/carta.json (CARTA_FUENTE = "local"),
//   * los pedidos no se registran (no hay dónde guardarlos),
//   * el panel de pedidos muestra que el registro no está conectado.
//
// Para conectar: completar la URL del proyecto y la clave pública (anon). Nunca la service_role.
window.MEGAMI_CONFIG = {
  CARTA_FUENTE: "local",   // "local" o "supabase"
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  WHATSAPP: "56950646715",
  PEDIDOS_DE_PRUEBA: true, // marca los pedidos como prueba mientras la landing sea una maqueta
};
