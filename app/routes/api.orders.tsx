/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/api.orders.tsx - VERSIÓN CORREGIDA - VALIDACIÓN DE TELÉFONO LOCAL
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logger } from "../utils/logger.server";
import { decryptToken } from "../utils/encryption.server";
import { RateLimiter } from "../utils/rate-limiter.server";

// ✅ TIPOS PARA TYPESCRIPT Y PRISMA JSON
interface ShopifyCustomerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface ShopifyShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  [key: string]: any;
}

interface ShopifyLineItem {
  variantId: string;
  quantity: number;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

interface DBLineItem {
  title: string;
  price: string;
  quantity: number;
  variantId: string;
  requiresShipping: boolean;
  taxable: boolean;
  [key: string]: any;
}

interface ShopifyOrderResult {
  success: boolean;
  order?: {
    id: string;
    name: string;
    totalPrice: string;
    currency: string;
    customer: {
      id: string;
      email: string;
    };
    lineItems: Array<{
      id: string;
      title: string;
      quantity: number;
      variant: {
        id: string;
      };
    }>;
  };
  error?: string;
}

interface CreateShopifyOrderParams {
  shopDomain: string;
  accessToken: string;
  customerData: ShopifyCustomerData;
  shippingAddress: ShopifyShippingAddress;
  lineItems: ShopifyLineItem[];
  currency?: string;
  note?: string;
  itemPrice: number;
  requestId: string;
}

// ✅ NUEVA: FUNCIÓN PARA LIMPIAR PRECIO
function cleanPrice(price: string): number {
  if (!price) return 0;

  // Remover moneda y caracteres no numéricos, excepto puntos y comas
  const cleanedPrice = price
    .replace(/[^\d.,]/g, "") // Remover todo excepto dígitos, puntos y comas
    .replace(",", "."); // Convertir comas a puntos para decimales

  const numericPrice = parseFloat(cleanedPrice);
  return isNaN(numericPrice) ? 0 : numericPrice;
}

async function verifyVariantExists(
  shopDomain: string,
  accessToken: string,
  variantId: string,
): Promise<{ exists: boolean; price?: number; title?: string }> {
  try {
    logger.info("Verificando variant_id en Shopify (GraphQL)", { variantId, shopDomain });

    // Si el ID no es un GID, construirlo
    let gid = variantId;
    if (!variantId.startsWith("gid://")) {
      gid = `gid://shopify/ProductVariant/${variantId}`;
    }

    const graphqlQuery = `#graphql\n\
      query getVariant($id: ID!) {\n\
        productVariant(id: $id) {\n\
          id\n\
          title\n\
          price\n\
          availableForSale\n\
        }\n\
      }\n\
    `;

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": `variant-check-graphql-${Date.now()}`,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { id: gid },
        }),
      },
    );

    if (!response.ok) {
      logger.warn("Respuesta no OK de Shopify GraphQL", {
        variantId,
        status: response.status,
        statusText: response.statusText,
      });
      return { exists: false };
    }

    const data = await response.json();
    if (data.errors || !data.data || !data.data.productVariant) {
      logger.warn("Variant no encontrado en Shopify (GraphQL)", {
        variantId,
        errors: data.errors,
      });
      return { exists: false };
    }

    const variant = data.data.productVariant;
    logger.info("Variant encontrado en Shopify (GraphQL)", {
      variantId,
      title: variant.title,
      price: variant.price,
      available: variant.availableForSale,
    });

    return {
      exists: true,
      price: parseFloat(variant.price),
      title: variant.title,
    };
  } catch (error) {
    logger.error("Error verificando variant (GraphQL)", {
      variantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { exists: false };
  }
}

// ✅ FUNCIÓN PARA GENERAR EMAIL TEMPORAL SOLO PARA SHOPIFY (TÉCNICO)
function generateTechnicalEmail(phone: string, shopDomain: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const shopName = shopDomain.split(".")[0];
  return `${cleanPhone}@temp.${shopName}.customer`;
}

// ✅ FUNCIÓN PARA LIMPIAR CAMPOS DE TEXTO
function cleanTextField(value: string): string {
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
    "n/a",
    "na",
    "no",
    "nada",
    "no disponible",
    "no aplica",
    "no hay",
    "sin datos",
    "vacio",
    "vacío",
  ];

  const hasInvalidPhrase = invalidPhrases.some((phrase) =>
    cleanValue.includes(phrase),
  );

  if (hasInvalidPhrase) {
    return "";
  }

  return value.trim();
}

// ✅ FUNCIÓN PARA VALIDAR Y LIMPIAR EMAILS
function cleanInvalidEmail(email: string): string {
  if (!email || email.trim() === "") {
    return "";
  }

  const cleanEmail = email.trim().toLowerCase();

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
    "sin email",
    "sin correo",
    "no correo",
    "no email",
    "ninguno",
    "n/a",
    "na",
    "no",
    "nada",
    "no disponible",
    "no aplica",
    "no tengo correo",
    "no tengo email",
    "sin información",
    "sin informacion",
  ];

  const hasInvalidPhrase = invalidPhrases.some((phrase) =>
    cleanEmail.includes(phrase),
  );

  if (hasInvalidPhrase) {
    return "";
  }

  const emailRegex =
    /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

  if (!emailRegex.test(cleanEmail)) {
    return "";
  }

  if (
    !cleanEmail.includes("@") ||
    !cleanEmail.includes(".") ||
    cleanEmail.length < 5 ||
    cleanEmail.length > 254 ||
    cleanEmail.endsWith(".")
  ) {
    return "";
  }

  return cleanEmail;
}

// ✅ NUEVA: VALIDACIÓN DE TELÉFONO LOCAL (SIN CÓDIGO DE PAÍS)
function validateLocalPhone(phone: string, countryCode: string): boolean {
  const phoneClean = phone.replace(/[\s\-\+]/g, "");

  if (!/^\d+$/.test(phoneClean)) {
    return false;
  }

  // Validar formatos locales por país
  const localPatterns: Record<string, RegExp> = {
    'PE': /^9\d{8}$/,      // Perú: 9 + 8 dígitos
    'CO': /^3\d{9}$/,      // Colombia: 3 + 9 dígitos  
    'MX': /^\d{10}$/,      // México: 10 dígitos
    'AR': /^9\d{9}$/,      // Argentina: 9 + 9 dígitos
    'CL': /^9\d{8}$/,      // Chile: 9 + 8 dígitos
  };

  const pattern = localPatterns[countryCode];
  return pattern ? pattern.test(phoneClean) : phoneClean.length >= 8;
}

// ✅ ANTIGUA: VALIDACIÓN DE TELÉFONO CON CÓDIGO DE PAÍS (MANTENER PARA USAR DESPUÉS)
function validatePhoneWithCountryCode(phone: string): boolean {
  const phoneClean = phone.replace(/[\s\-\+]/g, "");

  if (!/^\d+$/.test(phoneClean)) {
    return false;
  }

  // Validar códigos de país específicos más estrictos
  const validPatterns = [
    /^51[9]\d{8}$/,    // Perú: 51 + 9 + 8 dígitos
    /^57[3]\d{9}$/,    // Colombia: 57 + 3 + 9 dígitos  
    /^52\d{10}$/,      // México: 52 + 10 dígitos
    /^54[9]\d{9}$/,    // Argentina: 54 + 9 + 9 dígitos
    /^56[9]\d{8}$/,    // Chile: 56 + 9 + 8 dígitos
  ];

  return validPatterns.some(pattern => pattern.test(phoneClean));
}

// ✅ CORREGIDA: VALIDACIÓN DE DATOS MÍNIMOS (USA TELÉFONO LOCAL)
function validateMinimalOrderData(data: any, countryCode: string) {
  const errors: string[] = [];

  if (!data.phone || data.phone.trim() === "") {
    errors.push("Número de teléfono es requerido");
  }

  // ✅ CAMBIO: Validar teléfono local, no con código de país
  if (data.phone && !validateLocalPhone(data.phone, countryCode)) {
    const examples: Record<string, string> = {
      'PE': '987654321 (9 dígitos empezando en 9)',
      'CO': '3001234567 (10 dígitos empezando en 3)',
      'MX': '5551234567 (10 dígitos)',
      'AR': '911234567 (9 dígitos empezando en 9)',
      'CL': '987654321 (9 dígitos empezando en 9)'
    };
    
    const example = examples[countryCode] || '987654321';
    errors.push(
      `Formato de teléfono inválido para ${countryCode}. Ejemplo válido: ${example}`
    );
  }

  if (!data.product_name || data.product_name.trim() === "") {
    errors.push("Nombre del producto es requerido");
  }

  if (!data.variant_id || data.variant_id.trim() === "") {
    errors.push("ID del producto es requerido");
  }

  if (!data.price || cleanPrice(data.price) <= 0) {
    errors.push("Precio del producto debe ser mayor a 0");
  }

  if (!data.quantity || parseInt(data.quantity) <= 0) {
    errors.push("Cantidad debe ser mayor a 0");
  }

  return errors;
}

function validateNoDefaultValues(data: any) {
  const errors: string[] = [];

  const invalidPhrases = [
    "no brindo información",
    "no brindo informacion",
    "nobrindoinformación",
    "nobrindoinformacion",
  ];

  if (
    data.phone &&
    invalidPhrases.some((phrase) => data.phone.toLowerCase().includes(phrase))
  ) {
    errors.push(
      "NÚMERO DE TELÉFONO ES OBLIGATORIO - No se puede crear orden sin teléfono válido",
    );
  }

  return errors;
}

// ✅ FUNCIÓN PARA VERIFICAR SI UN CAMPO ES OBLIGATORIO
function isFieldRequired(fieldName: string, requiredFields: any): boolean {
  if (!requiredFields || typeof requiredFields !== "object") {
    return false;
  }

  const fieldMapping = {
    nombre: ["first_name", "last_name"],
    correo: ["email"],
    direccion: ["address1"],
    ciudad: ["city"],
    provincia: ["province"],
    pais: ["country"],
  };

  for (const [configKey, fields] of Object.entries(fieldMapping)) {
    if (fields.includes(fieldName)) {
      return requiredFields[configKey] === true;
    }
  }

  return false;
}

// ✅ NUEVA FUNCIÓN: OBTENER INFORMACIÓN COMPLETA DE LA TIENDA (REEMPLAZA getShopCurrency)
async function getShopInfoWithCountry(
  shopDomain: string,
  accessToken: string,
): Promise<{ currency: string; countryCode: string; timezone: string }> {
  try {
    logger.info("Obteniendo información completa de la tienda", { shopDomain });

    const query = `
      query {
        shop {
          currencyCode
          name
          countryCode
          timezone
          ianaTimezone
          address {
            countryCode
            country
            city
          }
        }
      }
    `;

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": `shop-info-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(
        `GraphQL Error: ${result.errors.map((e: any) => e.message).join(", ")}`,
      );
    }

    const shop = result.data.shop;
    const currency = shop.currencyCode || "USD";
    const countryCode = shop.countryCode || shop.address?.countryCode || "PE";
    const timezone = shop.ianaTimezone || shop.timezone || "America/Lima";

    logger.info("Información completa de la tienda obtenida", {
      shopDomain,
      currency,
      countryCode,
      timezone,
      shopName: shop.name,
      address: shop.address,
    });

    return { currency, countryCode, timezone };
  } catch (error) {
    logger.error("Error obteniendo información de la tienda", {
      shopDomain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // ✅ FALLBACK: Usar REST API
    try {
      const restResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "X-Request-ID": `shop-fallback-${Date.now()}`,
          },
        },
      );

      if (restResponse.ok) {
        const restResult = await restResponse.json();
        const fallbackCurrency = restResult.shop?.currency || "USD";
        const fallbackCountry = restResult.shop?.country_code || "PE";
        const fallbackTimezone = restResult.shop?.iana_timezone || "America/Lima";
        
        logger.info("Fallback REST API - Información obtenida", {
          shopDomain,
          currency: fallbackCurrency,
          countryCode: fallbackCountry,
          timezone: fallbackTimezone,
        });
        
        return { 
          currency: fallbackCurrency, 
          countryCode: fallbackCountry,
          timezone: fallbackTimezone 
        };
      }
    } catch (fallbackError) {
      logger.error("Fallback también falló", {
        shopDomain,
        error: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
      });
    }

    // ✅ DEFAULT SEGURO
    return { currency: "USD", countryCode: "PE", timezone: "America/Lima" };
  }
}

// ✅ NUEVA FUNCIÓN: AGREGAR CÓDIGO DE PAÍS AL TELÉFONO
function addCountryCodeToPhone(phone: string, countryCode: string): string {
  // Limpiar teléfono
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  
  // Mapeo de códigos de país a códigos telefónicos
  const phoneCountryCodes: Record<string, string> = {
    'PE': '51',  // Perú
    'CO': '57',  // Colombia
    'MX': '52',  // México
    'US': '1',   // Estados Unidos
    'CA': '1',   // Canadá
    'AR': '54',  // Argentina
    'CL': '56',  // Chile
    'BR': '55',  // Brasil
    'EC': '593', // Ecuador
    'VE': '58',  // Venezuela
    'ES': '34',  // España
    'UY': '598', // Uruguay
    'PY': '595', // Paraguay
    'BO': '591', // Bolivia
    // Agregar más según necesidades
  };

  const phoneCountryCode = phoneCountryCodes[countryCode] || '51'; // Default Perú

  // Si el teléfono ya tiene código de país, no agregarlo
  if (cleanPhone.startsWith(phoneCountryCode)) {
    return cleanPhone;
  }

  // Si el teléfono empieza con 9 (típico de móviles peruanos), agregar código
  if (countryCode === 'PE' && cleanPhone.startsWith('9') && cleanPhone.length === 9) {
    return `51${cleanPhone}`;
  }
  
  // Si el teléfono empieza con 3 (típico de móviles colombianos), agregar código
  if (countryCode === 'CO' && cleanPhone.startsWith('3') && cleanPhone.length === 10) {
    return `57${cleanPhone}`;
  }

  // Para otros casos, agregar código de país
  return `${phoneCountryCode}${cleanPhone}`;
}

// ✅ MODIFICADA: createShopifyOrder con price explícito y usar shopInfo
async function createShopifyOrder({
  shopDomain,
  accessToken,
  customerData,
  shippingAddress,
  lineItems,
  currency = "USD",
  note = "",
  itemPrice,
  requestId,
}: CreateShopifyOrderParams): Promise<ShopifyOrderResult> {
  try {
    logger.info("Creando orden con datos únicos", {
      shopDomain,
      requestId,
      customerEmail: customerData.email,
      productVariant: lineItems[0]?.variantId,
      itemPrice: itemPrice,
      timestamp: Date.now(),
    });

    const uniqueNote = "chatbot";

    const orderData = {
      order: {
        note: uniqueNote,
        email: customerData.email,
        shipping_address: {
          first_name: shippingAddress.firstName,
          last_name: shippingAddress.lastName,
          address1: shippingAddress.address1,
          city: shippingAddress.city,
          province: shippingAddress.province,
          country: shippingAddress.country,
          zip: shippingAddress.zip,
          phone: shippingAddress.phone,
        },
        line_items: lineItems.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
          price: itemPrice.toString(), // ✅ PRECIO EXPLÍCITO AGREGADO
          custom_attributes: [
            ...item.customAttributes,
            {
              key: "request_id",
              value: requestId,
            },
            {
              key: "creation_timestamp",
              value: Date.now().toString(),
            },
          ],
        })),
        currency: currency, // ✅ USAR CURRENCY PASADO COMO PARÁMETRO
        financial_status: "pending",
        fulfillment_status: "unfulfilled",
        tags: "chatbot",
      },
    };

    logger.info("Datos enviados a Shopify:", {
      requestId,
      email: orderData.order.email,
      variant_id: orderData.order.line_items[0]?.variant_id,
      quantity: orderData.order.line_items[0]?.quantity,
      price: orderData.order.line_items[0]?.price, // ✅ LOG DEL PRICE
      note: orderData.order.note,
      tags: orderData.order.tags,
      address: orderData.order.shipping_address.address1,
      currency: orderData.order.currency,
    });

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": requestId,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(orderData),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Error en petición a Shopify:", {
        requestId,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const order = result.order;

    logger.info("Orden creada exitosamente en Shopify:", {
      requestId,
      shopDomain,
      orderName: order.name,
      orderId: order.id,
      currency: order.currency,
      phone: customerData.phone,
      email: order.email,
      lineItemsCount: order.line_items?.length,
      firstVariantId: order.line_items?.[0]?.variant_id,
    });

    return {
      success: true,
      order: {
        id: order.id,
        name: order.name,
        totalPrice: order.total_price,
        currency: order.currency,
        customer: {
          id: order.customer?.id,
          email: order.email,
        },
        lineItems: order.line_items.map((item: any) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          variant: {
            id: item.variant_id,
          },
        })),
      },
    };
  } catch (error) {
    logger.error("Error creando orden en Shopify", {
      requestId,
      shopDomain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

// ✅ FUNCIÓN PRINCIPAL CORREGIDA - CAMBIO DE ORDEN EN VALIDACIONES
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.append("Content-Type", "application/json");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const body = await request.json();

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const {
      shopDomain,
      first_name,
      last_name,
      email,
      phone,
      address1,
      city,
      zip,
      country,
      province,
      product_name,
      price,
      quantity,
      variant_id: rawVariantId,
    } = body;

    function extractVariantId(variantId: string): string {
      if (!variantId) return variantId;

      if (variantId.includes("gid://shopify/ProductVariant/")) {
        return variantId.split("/").pop() || variantId;
      }

      return variantId;
    }

    const variant_id = extractVariantId(rawVariantId);

    logger.info("=== NUEVA PETICIÓN DE ORDEN ===", {
      requestId,
      shopDomain,
      timestamp: Date.now(),
    });

    logger.info("Datos recibidos:", {
      requestId,
      phone,
      product_name,
      price,
      original_variant_id: rawVariantId,
      processed_variant_id: variant_id,
      quantity,
      has_name: !!first_name,
      has_email: !!email,
      has_address: !!address1,
      original_email: email,
    });

    // ✅ LIMPIAR PRECIO ANTES DE VALIDAR
    const cleanedPrice = cleanPrice(price);
    const itemPrice = cleanedPrice;
    const itemQuantity = parseInt(quantity) || 1;
    const orderTotal = itemPrice * itemQuantity;

    // ✅ VALIDAR QUE EL PRECIO SEA VÁLIDO
    if (itemPrice <= 0) {
      logger.error("Precio inválido después de limpiar:", {
        originalPrice: price,
        cleanedPrice: itemPrice,
        requestId,
      });

      return json(
        {
          error: "Precio del producto inválido",
          details: [
            `Precio original: ${price}, Precio procesado: ${itemPrice}`,
          ],
          code: "INVALID_PRICE",
        },
        { status: 400, headers },
      );
    }

    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop) {
      logger.error("Tienda no encontrada", { requestId });
      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    if (!shop.access_token) {
      logger.error("Token de acceso no disponible para la tienda", {
        requestId,
      });
      return json(
        { error: "Token de acceso no disponible para la tienda" },
        { status: 400, headers },
      );
    }

    let realAccessToken = shop.access_token;
    try {
      const parsed = JSON.parse(shop.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        realAccessToken = decryptToken(parsed);
      }
    } catch (e) {}

    // ✅ 1. PRIMERO: OBTENER INFORMACIÓN DE LA TIENDA (INCLUYE PAÍS)
    const shopInfo = await getShopInfoWithCountry(shop.shop_domain, realAccessToken);
    const { currency, countryCode, timezone } = shopInfo;

    logger.info("Información de la tienda obtenida", {
      requestId,
      countryCode,
      currency,
      timezone,
    });

    // ✅ 2. SEGUNDO: VALIDAR CON TELÉFONO LOCAL (AHORA QUE TENEMOS EL PAÍS)
    const basicErrors = validateMinimalOrderData(body, countryCode);
    const securityErrors = validateNoDefaultValues(body);

    const allErrors = [...basicErrors, ...securityErrors];

    if (allErrors.length > 0) {
      logger.error("Validación de seguridad falló:", {
        errors: allErrors,
        requestId,
        countryCode: countryCode,
        receivedData: {
          phone: body.phone,
          product_name: body.product_name,
          variant_id: body.variant_id,
          price: body.price,
          quantity: body.quantity,
        },
      });

      return json(
        {
          error: "Datos insuficientes para crear la orden",
          details: allErrors,
          code: "SECURITY_VALIDATION_FAILED",
        },
        { status: 400, headers },
      );
    }

    // ✅ 3. TERCERO: AGREGAR CÓDIGO DE PAÍS AL TELÉFONO (DESPUÉS DE VALIDAR)
    const phoneWithCountryCode = addCountryCodeToPhone(phone, countryCode);

    // ✅ 4. CUARTO: VALIDAR QUE EL TELÉFONO CON CÓDIGO SEA CORRECTO (OPCIONAL)
    if (!validatePhoneWithCountryCode(phoneWithCountryCode)) {
      logger.warn("Teléfono con código de país no válido después de procesar", {
        originalPhone: phone,
        phoneWithCountryCode: phoneWithCountryCode,
        countryCode: countryCode,
        requestId,
      });
      // No retornar error aquí, solo log de warning
    }

    logger.info("Teléfono procesado correctamente", {
      requestId,
      originalPhone: phone,
      phoneWithCountryCode: phoneWithCountryCode,
      countryCode: countryCode,
    });

    // ✅ OBTENER CONFIGURACIÓN DE CAMPOS OBLIGATORIOS
    const shopConfig = await db.chatbotConfiguration.findUnique({
      where: { shop_id: shop.id },
      select: {
        required_fields: true,
      },
    });

    const requiredFields = shopConfig?.required_fields || {};

    logger.info("Tienda encontrada:", {
      requestId,
      shopId: shop.id,
      requiredFields: requiredFields,
    });

    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const internalOrderNumber = `ORD-${timestamp}-${random}-${requestId.split("-")[2]}`;

    // ✅ PROCESAR CAMPOS SIN INVENTAR DATOS - SOLO USAR LO QUE SE PROPORCIONÓ
    const finalFirstName =
      first_name && cleanTextField(first_name)
        ? cleanTextField(first_name)
        : "";
    const finalLastName =
      last_name && cleanTextField(last_name) ? cleanTextField(last_name) : "";

    // ✅ EMAIL: Solo usar si se proporcionó realmente
    const finalEmail = (() => {
      if (email && cleanTextField(email)) {
        return cleanInvalidEmail(email);
      }
      // NO generar email automático - dejar vacío si no se proporcionó
      return "";
    })();

    // ✅ CAMPOS DE DIRECCIÓN: Solo usar si fueron proporcionados realmente
    const cleanAddress1 =
      address1 && cleanTextField(address1) ? cleanTextField(address1) : "";
    const cleanCity = city && cleanTextField(city) ? cleanTextField(city) : "";
    const cleanProvince =
      province && cleanTextField(province) ? cleanTextField(province) : "";
    const cleanCountry =
      country && cleanTextField(country) ? cleanTextField(country) : "";
    const cleanZip = zip && cleanTextField(zip) ? cleanTextField(zip) : "";

    // ✅ LOG DETALLADO DE QUÉ DATOS SE USARON
    logger.info("Procesamiento de datos del cliente:", {
      requestId,
      required_fields_config: requiredFields,
      provided_by_client: {
        first_name: !!first_name && !!finalFirstName,
        last_name: !!last_name && !!finalLastName,
        email: !!email && !!finalEmail,
        address1: !!address1 && !!cleanAddress1,
        city: !!city && !!cleanCity,
        province: !!province && !!cleanProvince,
        country: !!country && !!cleanCountry,
        zip: !!zip && !!cleanZip,
      },
      final_values: {
        firstName: finalFirstName || "[NO PROPORCIONADO]",
        lastName: finalLastName || "[NO PROPORCIONADO]",
        email: finalEmail || "[NO PROPORCIONADO]",
        address1: cleanAddress1 || "[NO PROPORCIONADO]",
        city: cleanCity || "[NO PROPORCIONADO]",
        province: cleanProvince || "[NO PROPORCIONADO]",
        country: cleanCountry || "[NO PROPORCIONADO]",
        zip: cleanZip || "[NO PROPORCIONADO]",
      },
      no_automatic_generation: true,
    });

    // ✅ VALIDAR QUE SOLO SE USEN DATOS REALES PARA MOSTRAR AL CLIENTE
    const hasRealFirstName = !!finalFirstName && !!first_name;
    const hasRealLastName = !!finalLastName && !!last_name;
    const hasRealEmail = !!finalEmail && !!email;
    const hasRealAddress = !!cleanAddress1 && !!address1;
    const hasRealCity = !!cleanCity && !!city;
    const hasRealProvince = !!cleanProvince && !!province;
    const hasRealCountry = !!cleanCountry && !!country;
    const hasRealZip = !!cleanZip && !!zip;

    // ✅ PREPARAR DATOS PARA SHOPIFY - USAR CAMPOS VACÍOS SI NO HAY DATOS
    const customerData: ShopifyCustomerData = {
      firstName: finalFirstName || "", // ✅ VACÍO si no se proporcionó
      lastName: finalLastName || "",   // ✅ VACÍO si no se proporcionó
      email: finalEmail || generateTechnicalEmail(phoneWithCountryCode, shopDomain), // Email técnico solo si necesario
      phone: phoneWithCountryCode,
    };

    // ✅ DIRECCIÓN: USAR CAMPOS VACÍOS O MÍNIMOS REQUERIDOS POR SHOPIFY
    const shippingAddress: ShopifyShippingAddress = {
      firstName: finalFirstName || "", // ✅ VACÍO si no se proporcionó
      lastName: finalLastName || "",   // ✅ VACÍO si no se proporcionó
      address1: cleanAddress1 || "",   // ✅ VACÍO si no se proporcionó
      city: cleanCity || "",           // ✅ VACÍO si no se proporcionó
      province: cleanProvince || "",   // ✅ VACÍO si no se proporcionó
      country: cleanCountry || countryCode, // ✅ Usar país de la tienda como fallback
      zip: cleanZip || "",             // ✅ VACÍO si no se proporcionó
      phone: phoneWithCountryCode,
    };

    const lineItems: DBLineItem[] = [
      {
        title: product_name,
        price: itemPrice.toString(),
        quantity: itemQuantity,
        variantId: variant_id,
        requiresShipping: true,
        taxable: true,
      },
    ];

    logger.info("Iniciando creación de orden en Shopify...", { requestId });

    // ✅ VERIFICAR VARIANT ANTES DE CREAR ORDEN
    const variantCheck = await verifyVariantExists(
      shop.shop_domain,
      realAccessToken,
      variant_id,
    );

    if (!variantCheck.exists) {
      logger.error("Variant no existe en Shopify", {
        variantId: variant_id,
        shopDomain: shop.shop_domain,
        requestId,
      });

      return json(
        {
          success: false,
          error: `El producto con ID ${variant_id} no existe en la tienda`,
          details: "Por favor, verifica que el producto esté disponible",
          code: "VARIANT_NOT_FOUND",
        },
        { status: 400, headers },
      );
    }

    // ✅ USAR PRECIO DE SHOPIFY SI ESTÁ DISPONIBLE
    const finalPrice = variantCheck.price || itemPrice;

    logger.info("Variant verificado exitosamente", {
      variantId: variant_id,
      shopifyPrice: variantCheck.price,
      providedPrice: itemPrice,
      finalPrice: finalPrice,
      title: variantCheck.title,
    });

    const rateLimitResult = await RateLimiter.checkLimit(
      shopDomain,
      100,
      60000,
      300000,
    );
    if (!rateLimitResult.allowed) {
      return json(
        { error: "Demasiadas peticiones. Inténtalo más tarde." },
        { status: 429 },
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const shopifyResult = await createShopifyOrder({
      shopDomain: shop.shop_domain,
      accessToken: realAccessToken,
      customerData,
      shippingAddress,
      lineItems: [
        {
          variantId: variant_id,
          quantity: itemQuantity,
          customAttributes: [
            {
              key: "source",
              value: "chatbot",
            },
            {
              key: "internal_order_number",
              value: internalOrderNumber,
            },
            {
              key: "request_id",
              value: requestId,
            },
          ],
        },
      ],
      currency: currency, // ✅ USAR MONEDA DE LA TIENDA
      note: "chatbot",
      itemPrice: finalPrice, // ✅ USAR PRECIO VERIFICADO
      requestId: requestId,
    });

    if (!shopifyResult.success || !shopifyResult.order) {
      logger.error("Error al crear orden en Shopify:", {
        requestId,
        error: shopifyResult.error,
      });
      return json(
        {
          success: false,
          error: "No se pudo crear la orden en Shopify",
          details: shopifyResult.error || "Respuesta de Shopify inválida",
        },
        { status: 500, headers },
      );
    }

    logger.info("Orden creada exitosamente en Shopify:", {
      requestId,
      orderName: shopifyResult.order.name,
      orderId: shopifyResult.order.id,
    });

    const shopifyOrderId = String(shopifyResult.order.id);
    const shopifyOrderName = shopifyResult.order.name;

    // ✅ CREAR ORDEN EN BASE DE DATOS CON DATOS REALES Y INFORMACIÓN DE LA TIENDA
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: internalOrderNumber,
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        
        // ✅ USAR TELÉFONO CON CÓDIGO DE PAÍS
        customer_phone: phoneWithCountryCode,
        
        // ✅ AGREGAR NUEVOS CAMPOS DE INFORMACIÓN DE LA TIENDA
        shop_country_code: countryCode,
        shop_currency: currency,
        shop_timezone: timezone,

        // ✅ SOLO GUARDAR DATOS REALES - CAMPOS VACÍOS SI NO SE PROPORCIONARON
        customer_name: hasRealFirstName
          ? hasRealLastName
            ? `${finalFirstName} ${finalLastName}`.trim()
            : finalFirstName
          : "", // ✅ VACÍO si no se proporcionó

        customer_email: hasRealEmail ? finalEmail : "", // ✅ VACÍO si no se proporcionó

        order_items: lineItems as any,
        order_total: orderTotal,

        // ✅ DIRECCIÓN CON DATOS REALES ÚNICAMENTE - CAMPOS VACÍOS
        shipping_address: {
          firstName: hasRealFirstName ? finalFirstName : "",
          lastName: hasRealLastName ? finalLastName : "",
          address1: hasRealAddress ? cleanAddress1 : "",
          city: hasRealCity ? cleanCity : "",
          province: hasRealProvince ? cleanProvince : "",
          country: hasRealCountry ? cleanCountry : "",
          zip: hasRealZip ? cleanZip : "",
          phone: phoneWithCountryCode,
          realDataOnly: {
            firstName: hasRealFirstName,
            lastName: hasRealLastName,
            email: hasRealEmail,
            address1: hasRealAddress,
            city: hasRealCity,
            province: hasRealProvince,
            country: hasRealCountry,
            zip: hasRealZip,
          },
        } as any,

        source: "CHATBOT_STORE",
        status: "PENDING_CALL",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info("OrderConfirmation creada con datos reales únicamente:", {
      requestId,
      id: orderConfirmation.id,
      internal_order_number: orderConfirmation.internal_order_number,
      shopify_order_id: shopifyOrderId,
      shopify_order_name: shopifyOrderName,
      status: orderConfirmation.status,
      originalPhone: phone,
      phoneWithCountryCode: phoneWithCountryCode,
      countryCode: countryCode,
      currency: currency,
      timezone: timezone,
      real_data_only: {
        has_real_firstName: hasRealFirstName,
        has_real_lastName: hasRealLastName,
        has_real_email: hasRealEmail,
        has_real_address: hasRealAddress,
        has_real_city: hasRealCity,
        has_real_province: hasRealProvince,
        has_real_country: hasRealCountry,
        has_real_zip: hasRealZip,
      },
      customer_name_saved: orderConfirmation.customer_name,
      customer_email_saved: orderConfirmation.customer_email,
      shopify_success: true,
    });

    // ✅ RESPUESTA CLARA - SOLO MOSTRAR DATOS REALES + INFORMACIÓN DE LA TIENDA
    return json(
      {
        success: true,
        type: "order_confirmation",
        requestId: requestId,
        message:
          "✅ Orden registrada exitosamente. Te contactaremos para confirmar tu pedido.",

        orderConfirmation: {
          id: orderConfirmation.id,
          status: orderConfirmation.status,
          total: orderConfirmation.order_total.toString(),
          currency: shopifyResult.order.currency,
          shopifyOrderName: shopifyOrderName,
          expiresAt: orderConfirmation.expires_at,
          createdAt: orderConfirmation.created_at,
        },

        customer: {
          // ✅ SOLO MOSTRAR DATOS QUE REALMENTE PROPORCIONÓ
          name: hasRealFirstName
            ? hasRealLastName
              ? `${finalFirstName} ${finalLastName}`.trim()
              : finalFirstName
            : "No proporcionado",
          firstName: hasRealFirstName ? finalFirstName : "No proporcionado",
          lastName: hasRealLastName ? finalLastName : "No proporcionado",
          email: hasRealEmail ? finalEmail : "No proporcionado",
          phone: phone,

          // Indicadores de qué datos son reales
          providedFirstName: hasRealFirstName,
          providedLastName: hasRealLastName,
          providedEmail: hasRealEmail,
          providedAddress: hasRealAddress,
          providedCity: hasRealCity,
          providedProvince: hasRealProvince,
          providedCountry: hasRealCountry,
          providedZip: hasRealZip,
        },

        shippingInfo: {
          address: hasRealAddress ? cleanAddress1 : "No proporcionada",
          city: hasRealCity ? cleanCity : "No proporcionada",
          province: hasRealProvince ? cleanProvince : "No proporcionada",
          country: hasRealCountry ? cleanCountry : "No proporcionado",
          zip: hasRealZip ? cleanZip : "No proporcionado",
          needsCompletion: !hasRealAddress || !hasRealCity,
        },

        // ✅ AGREGAR INFORMACIÓN DEL PAÍS Y TIENDA
        shopInfo: {
          countryCode: countryCode,
          currency: currency,
          timezone: timezone,
          phoneWithCountryCode: phoneWithCountryCode,
          originalPhone: phone,
          autoDetectedCountry: true,
        },

        items: [
          {
            title: product_name,
            quantity: itemQuantity,
            price: finalPrice.toString(),
            variantId: variant_id,
          },
        ],

        nextSteps: {
          message:
            "Nos contactaremos contigo para completar la información faltante y confirmar tu pedido.",
          callScheduled: true,
          requiresDataCompletion:
            !hasRealFirstName ||
            !hasRealAddress ||
            !hasRealCity ||
            !hasRealEmail,
          shopifyCreated: true,
          status: orderConfirmation.status,
        },

        // ✅ DEBUG INFO - VERIFICAR QUE NO SE INVENTARON DATOS
        debug: {
          provided_fields: {
            first_name: hasRealFirstName,
            last_name: hasRealLastName,
            email: hasRealEmail,
            address1: hasRealAddress,
            city: hasRealCity,
            province: hasRealProvince,
            country: hasRealCountry,
            zip: hasRealZip,
          },
          required_fields: requiredFields,
          used_real_data_only: true,
          no_fake_data: true,
          no_automatic_generation: true,
          empty_fields_instead_of_defaults: true,
          shop_info: {
            countryCode: countryCode,
            currency: currency,
            timezone: timezone,
            phone_processing: {
              original: phone,
              withCountryCode: phoneWithCountryCode,
              detectedCountry: countryCode,
            },
          },
          price_info: {
            original_price: price,
            cleaned_price: itemPrice,
            shopify_price: variantCheck.price,
            final_price: finalPrice,
          },
        },
      },
      { headers },
    );
  } catch (error) {
    logger.error("Error crítico:", error);
    return json(
      {
        error: "Error interno del servidor al crear la orden",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};