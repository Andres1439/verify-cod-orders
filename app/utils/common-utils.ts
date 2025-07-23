// app/utils/common-utils.ts
// Utilidades comunes compartidas entre diferentes rutas

/**
 * Limpia y convierte un precio string a number
 * @param price - String del precio que puede contener moneda y caracteres especiales
 * @returns Number limpio del precio
 */
export function cleanPrice(price: string): number {
  if (!price) return 0;

  // Remover moneda y caracteres no numéricos, excepto puntos y comas
  const cleanedPrice = price
    .replace(/[^\d.,]/g, "") // Remover todo excepto dígitos, puntos y comas
    .replace(",", "."); // Convertir comas a puntos para decimales

  const numericPrice = parseFloat(cleanedPrice);
  return isNaN(numericPrice) ? 0 : numericPrice;
}

/**
 * Formatea un número de teléfono según el país
 * @param phone - Número de teléfono a formatear
 * @param country - Código del país (default: 'PE')
 * @returns Número de teléfono formateado
 */
export function formatPhoneNumber(phone: string, country: string = 'PE'): string {
  // Limpiar número
  const cleanPhone = phone.toString().replace(/[\s\+\-\(\)\.\#\*]/g, '');
  
  // Códigos de país
  const countryCodes: Record<string, string> = {
    'PE': '51', 'CO': '57', 'MX': '52', 'CL': '56',
    'AR': '54', 'EC': '593', 'BO': '591', 'PY': '595'
  };
  
  const countryCode = countryCodes[country] || '51';
  
  let formattedPhone = '';
  
  if (cleanPhone.startsWith(countryCode)) {
    formattedPhone = cleanPhone;
  } else if (cleanPhone.startsWith('0')) {
    formattedPhone = countryCode + cleanPhone.substring(1);
  } else {
    formattedPhone = countryCode + cleanPhone;
  }
  
  return formattedPhone;
}

/**
 * Genera un email técnico temporal para Shopify
 * @param phone - Número de teléfono del cliente
 * @param shopDomain - Dominio de la tienda
 * @returns Email temporal generado
 */
export function generateTechnicalEmail(phone: string, shopDomain: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const shopName = shopDomain.split(".")[0];
  return `${cleanPhone}@temp.${shopName}.customer`;
}

/**
 * Limpia campos de texto removiendo frases de rechazo comunes
 * @param value - Valor del campo a limpiar
 * @returns String limpio o vacío si contiene frases de rechazo
 */
export function cleanTextField(value: string): string {
  if (!value || value.trim() === "") {
    return "";
  }

  const cleanValue = value.trim().toLowerCase();

  const invalidPhrases = [
    "no brindo información",
    "no brindo informacion",
    "nobrindoinformación",
    "nobrindoinformacion",
    "no doy información",
    "no doy informacion",
    "no proporciono",
    "no tengo",
    "no quiero",
    "no deseo",
    "prefiero no dar",
    "prefiero no",
    "no dar",
    "sin información",
    "sin informacion",
    "ninguno",
    "ninguna",
    "n/a",
    "na",
    "no aplica",
    "no disponible",
    "privado",
    "confidencial",
  ];

  // Verificar si contiene alguna frase inválida
  const containsInvalidPhrase = invalidPhrases.some(phrase => 
    cleanValue.includes(phrase)
  );

  return containsInvalidPhrase ? "" : value.trim();
}

/**
 * Genera un ID de request único
 * @param type - Tipo de request (default: "general")
 * @returns String único para identificar el request
 */
export function generateRequestId(type: string = "general"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}-${timestamp}-${random}`;
}

/**
 * Valida si un string es un email válido
 * @param email - Email a validar
 * @returns true si es válido, false si no
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida si un string es un teléfono válido
 * @param phone - Teléfono a validar
 * @returns true si es válido, false si no
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  
  const cleanPhone = phone.replace(/[\s\+\-\(\)\.\#\*]/g, '');
  return cleanPhone.length >= 8 && cleanPhone.length <= 15 && /^\d+$/.test(cleanPhone);
}

/**
 * Valida si un string es un GraphQL ID válido de Shopify
 * @param gid - GraphQL ID a validar (ej: "gid://shopify/Product/123")
 * @returns true si es válido, false si no
 */
export function isValidShopifyGID(gid: string): boolean {
  if (!gid || typeof gid !== 'string') return false;
  
  // Patrón para GraphQL ID de Shopify
  const shopifyGIDPattern = /^gid:\/\/shopify\/[A-Za-z]+\/\d+$/;
  return shopifyGIDPattern.test(gid);
}

/**
 * Extrae ID numérico de un GraphQL ID
 * @param graphqlId - ID de GraphQL (ej: "gid://shopify/Product/123")
 * @returns ID numérico como string
 */
export function extractNumericId(graphqlId: string): string {
  if (!graphqlId) return "";
  
  // Si ya es numérico, devolverlo
  if (/^\d+$/.test(graphqlId)) {
    return graphqlId;
  }
  
  // Extraer de GraphQL ID
  const parts = graphqlId.split('/');
  return parts[parts.length - 1] || "";
}
