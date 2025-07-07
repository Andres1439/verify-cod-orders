/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/api.orders.tsx - VERSIÓN CON FIX PARA CACHÉ DE SHOPIFY
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
  requestId: string; // ✅ NUEVO: ID único para evitar caché
}

interface CountryProvinceResult {
  country: string;
  province: string;
}

// ✅ FUNCIÓN PARA GENERAR EMAIL TEMPORAL
function generateTemporaryEmail(phone: string, shopDomain: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const shopName = shopDomain.split(".")[0];
  return `${cleanPhone}@temp.${shopName}.customer`;
}

// ✅ NUEVA FUNCIÓN PARA LIMPIAR CUALQUIER CAMPO DE TEXTO
function cleanTextField(value: string): string {
  // Si no hay valor, devolver vacío
  if (!value || value.trim() === "") {
    return "";
  }

  const cleanValue = value.trim().toLowerCase();

  // ✅ LISTA COMPLETA DE FRASES QUE INDICAN "NO QUIERO DAR INFORMACIÓN"
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

  // Si contiene alguna frase inválida, devolver vacío
  const hasInvalidPhrase = invalidPhrases.some((phrase) =>
    cleanValue.includes(phrase),
  );

  if (hasInvalidPhrase) {
    return ""; // ✅ DEVOLVER VACÍO EN LUGAR DEL TEXTO
  }

  // Si es válido, devolver el valor original (manteniendo mayúsculas)
  return value.trim();
}

// ✅ FUNCIÓN PARA LIMPIAR EMAILS INVÁLIDOS
function cleanInvalidEmail(
  email: string,
  phone: string,
  shopDomain: string,
): string {
  // Si no hay email, generar uno temporal
  if (!email || email.trim() === "") {
    return generateTemporaryEmail(phone, shopDomain);
  }

  const cleanEmail = email.trim().toLowerCase();

  // ✅ DETECTAR FRASES QUE NO SON EMAILS VÁLIDOS
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

  // Si contiene alguna frase inválida, generar email válido
  const hasInvalidPhrase = invalidPhrases.some((phrase) =>
    cleanEmail.includes(phrase),
  );

  if (hasInvalidPhrase) {
    const shopName = shopDomain.split(".")[0];
    return `nobrinda@${shopName}.com`;
  }

  // ✅ VALIDACIÓN BÁSICA DE EMAIL (RFC 5322 compatible)
  const emailRegex =
    /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

  if (!emailRegex.test(cleanEmail)) {
    const shopName = shopDomain.split(".")[0];
    return `nobrinda@${shopName}.com`;
  }

  // Verificaciones adicionales
  if (
    !cleanEmail.includes("@") ||
    !cleanEmail.includes(".") ||
    cleanEmail.length < 5 ||
    cleanEmail.length > 254 ||
    cleanEmail.endsWith(".")
  ) {
    const shopName = shopDomain.split(".")[0];
    return `nobrinda@${shopName}.com`;
  }

  // Si es válido, devolverlo limpio
  return cleanEmail;
}

// ✅ FUNCIÓN PARA VALIDAR DATOS MÍNIMOS
function validateMinimalOrderData(data: any) {
  const errors: string[] = [];

  // SOLO el teléfono es obligatorio
  if (!data.phone || data.phone.trim() === "") {
    errors.push("Número de teléfono es requerido");
  }

  if (!data.product_name || data.product_name.trim() === "") {
    errors.push("Nombre del producto es requerido");
  }

  if (!data.variant_id || data.variant_id.trim() === "") {
    errors.push("ID del producto es requerido");
  }

  if (!data.price || parseFloat(data.price) <= 0) {
    errors.push("Precio del producto debe ser mayor a 0");
  }

  return errors;
}

// ✅ FUNCIÓN PARA OBTENER LA MONEDA DE LA TIENDA (SIN CAMBIOS)
async function getShopCurrency(
  shopDomain: string,
  accessToken: string,
): Promise<string> {
  try {
    logger.info("Obteniendo moneda de la tienda", { shopDomain });

    const query = `
      query {
        shop {
          currencyCode
          name
          countryCode
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
          "X-Request-ID": `currency-${Date.now()}-${Math.random()}`, // ✅ EVITAR CACHÉ
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

    logger.info("Información de la tienda obtenida", {
      shopDomain,
      currency,
      country: shop.countryCode,
      name: shop.name,
    });

    return currency;
  } catch (error) {
    logger.error("Error obteniendo moneda de la tienda", {
      shopDomain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    try {
      const restResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "X-Request-ID": `currency-fallback-${Date.now()}`, // ✅ EVITAR CACHÉ
          },
        },
      );

      if (restResponse.ok) {
        const restResult = await restResponse.json();
        const fallbackCurrency = restResult.shop?.currency || "USD";
        logger.info("Fallback REST API - Moneda obtenida", {
          shopDomain,
          currency: fallbackCurrency,
        });
        return fallbackCurrency;
      }
    } catch (fallbackError) {
      logger.error("Fallback también falló", {
        shopDomain,
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown error",
      });
    }

    return "USD";
  }
}

// ✅ FUNCIÓN PRINCIPAL MODIFICADA PARA EVITAR CACHÉ
async function createShopifyOrder({
  shopDomain,
  accessToken,
  customerData,
  shippingAddress,
  lineItems,
  currency = "USD",
  note = "",
  itemPrice,
  requestId, // ✅ NUEVO PARÁMETRO
}: CreateShopifyOrderParams): Promise<ShopifyOrderResult> {
  try {
    logger.info("Creando orden con datos únicos", {
      shopDomain,
      requestId, // ✅ LOG DEL REQUEST ID
      customerEmail: customerData.email,
      productVariant: lineItems[0]?.variantId,
      timestamp: Date.now(),
    });

    const shopCurrency = await getShopCurrency(shopDomain, accessToken);

    // ✅ AGREGAR DATOS ÚNICOS PARA EVITAR CACHÉ
    const uniqueNote = `${note} - Request: ${requestId} - Timestamp: ${Date.now()}`;

    const orderData = {
      order: {
        note: uniqueNote, // ✅ NOTA ÚNICA
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
          custom_attributes: [
            ...item.customAttributes,
            // ✅ AGREGAR ATRIBUTOS ÚNICOS
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
        currency: shopCurrency,
        financial_status: "pending",
        fulfillment_status: "unfulfilled",
        tags: `chatbot,request-${requestId}`, // ✅ TAG ÚNICO
      },
    };

    // ✅ LOG DETALLADO DE LOS DATOS ENVIADOS
    logger.info("Datos enviados a Shopify:", {
      requestId,
      email: orderData.order.email,
      variant_id: orderData.order.line_items[0]?.variant_id,
      quantity: orderData.order.line_items[0]?.quantity,
      note: orderData.order.note,
      tags: orderData.order.tags,
      address: orderData.order.shipping_address.address1,
    });

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": requestId, // ✅ HEADER ÚNICO
          "Cache-Control": "no-cache", // ✅ EVITAR CACHÉ
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

    // ✅ GENERAR ID ÚNICO PARA ESTA PETICIÓN
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const {
      shopDomain,
      first_name,
      last_name,
      email,
      phone, // ✅ ÚNICO CAMPO OBLIGATORIO
      address1,
      city,
      zip,
      country,
      province,
      product_name, // ✅ OBLIGATORIO (viene del chatbot)
      price, // ✅ OBLIGATORIO (viene del chatbot)
      quantity,
      variant_id, // ✅ OBLIGATORIO (viene del chatbot)
    } = body;

    logger.info("=== NUEVA PETICIÓN DE ORDEN ===", {
      requestId, // ✅ LOG DEL REQUEST ID ÚNICO
      shopDomain,
      timestamp: Date.now(),
    });

    logger.info("Datos recibidos:", {
      requestId,
      phone,
      product_name,
      price,
      variant_id,
      quantity,
      has_name: !!first_name,
      has_email: !!email,
      has_address: !!address1,
      original_email: email,
    });

    // ✅ VALIDACIÓN SOLO DE CAMPOS CRÍTICOS
    const validationErrors = validateMinimalOrderData(body);
    if (validationErrors.length > 0) {
      return json(
        {
          error: validationErrors.join(", "),
          code: "MISSING_REQUIRED_FIELDS",
        },
        { status: 400, headers },
      );
    }

    // ✅ BUSCAR TIENDA
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

    logger.info("Tienda encontrada:", { requestId, shopId: shop.id });

    // ✅ PREPARAR DATOS CON VALORES POR DEFECTO
    const itemPrice = parseFloat(price) || 0;
    const itemQuantity = parseInt(quantity) || 1;
    const orderTotal = itemPrice * itemQuantity;

    // ✅ GENERAR NÚMERO DE ORDEN INTERNO ÚNICO CON REQUEST ID
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const internalOrderNumber = `ORD-${timestamp}-${random}-${requestId.split("-")[2]}`;

    // ✅ LIMPIAR TODOS LOS CAMPOS DE TEXTO
    const finalFirstName = cleanTextField(first_name);
    const finalLastName = cleanTextField(last_name);
    const finalEmail = cleanInvalidEmail(email, phone, shopDomain);
    const cleanAddress1 = cleanTextField(address1);
    const cleanCity = cleanTextField(city);
    const cleanZip = cleanTextField(zip);
    const cleanCountry = cleanTextField(country);
    const cleanProvince = cleanTextField(province);

    // ✅ LOG PARA DEBUGGING CON REQUEST ID
    logger.info("Campos procesados:", {
      requestId,
      original_first_name: first_name,
      final_first_name: finalFirstName,
      original_last_name: last_name,
      final_last_name: finalLastName,
      original_email: email,
      final_email: finalEmail,
      original_address1: address1,
      clean_address1: cleanAddress1,
      original_city: city,
      clean_city: cleanCity,
      original_variant_id: variant_id,
      original_quantity: quantity,
    });

    // ✅ USAR VALORES LIMPIOS O FALLBACKS
    const finalAddress =
      cleanAddress1 !== ""
        ? cleanAddress1
        : "Dirección pendiente de confirmación";
    const finalCity = cleanCity !== "" ? cleanCity : "Lima";
    const finalZip = cleanZip !== "" ? cleanZip : "15001";
    const finalCountry = cleanCountry !== "" ? cleanCountry : "";
    const finalProvince = cleanProvince !== "" ? cleanProvince : "";

    // ✅ DETECTAR PAÍS Y PROVINCIA (con valores limpios)
    const { country: detectedCountry, province: detectedProvince } =
      detectCountryAndProvince(finalCity, finalCountry, finalProvince);

    // ✅ CALCULAR SI TIENE DATOS COMPLETOS (ACTUALIZADO)
    const hasCompleteData = !!(
      finalFirstName !== "" && // ✅ Nombre limpio no vacío
      cleanAddress1 !== "" && // ✅ Dirección limpia no vacía
      !finalEmail.includes("nobrinda@") && // ✅ Email no fue generado
      !finalEmail.includes("@temp.") // ✅ No es temporal
    );

    // ✅ PREPARAR DATOS PARA SHOPIFY CON VALORES LIMPIOS
    const customerData: ShopifyCustomerData = {
      firstName: finalFirstName || "Cliente",
      lastName: finalLastName || "Chatbot",
      email: finalEmail,
      phone: phone,
    };

    const shippingAddress: ShopifyShippingAddress = {
      firstName: finalFirstName || "Cliente",
      lastName: finalLastName || "Chatbot",
      address1: finalAddress,
      city: finalCity,
      province: detectedProvince,
      country: detectedCountry,
      zip: finalZip,
      phone: phone,
    };

    const lineItems: DBLineItem[] = [
      {
        title: product_name,
        price: price,
        quantity: itemQuantity,
        variantId: variant_id,
        requiresShipping: true,
        taxable: true,
      },
    ];

    // ✅ CREAR ORDEN EN SHOPIFY CON REQUEST ID
    logger.info("Iniciando creación de orden en Shopify...", { requestId });

    let realAccessToken = shop.access_token;
    try {
      const parsed = JSON.parse(shop.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        realAccessToken = decryptToken(parsed);
      }
    } catch (e) {}

    // Rate limiting
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

    // ✅ PEQUEÑO DELAY PARA EVITAR PROBLEMAS DE TIMING
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
              key: "request_id", // ✅ AGREGAR REQUEST ID
              value: requestId,
            },
          ],
        },
      ],
      currency: "USD",
      note: `Orden creada desde chatbot con datos ${hasCompleteData ? "completos" : "mínimos"} - ${internalOrderNumber}${hasCompleteData ? "" : " - REQUIERE COMPLETAR DATOS DE ENVÍO"}`,
      itemPrice: itemPrice,
      requestId: requestId, // ✅ PASAR REQUEST ID
    });

    // ✅ VERIFICAR ÉXITO DE SHOPIFY
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

    // ✅ CONVERTIR A STRING PARA PRISMA
    const shopifyOrderId = String(shopifyResult.order.id);
    const shopifyOrderName = shopifyResult.order.name;

    // ✅ GUARDAR EN BASE DE DATOS LOCAL
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: internalOrderNumber,
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        customer_phone: phone,
        customer_name:
          `${finalFirstName || "Cliente"} ${finalLastName || "Chatbot"}`.trim(),
        customer_email: finalEmail,
        order_items: lineItems as any,
        order_total: orderTotal,
        shipping_address: shippingAddress as any,
        source: "CHATBOT_STORE",
        status: "PENDING_CALL",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    logger.info("OrderConfirmation creada con datos mínimos:", {
      requestId,
      id: orderConfirmation.id,
      internal_order_number: orderConfirmation.internal_order_number,
      shopify_order_id: shopifyOrderId,
      shopify_order_name: shopifyOrderName,
      status: orderConfirmation.status,
      phone: phone,
      has_complete_data: hasCompleteData,
      shopify_success: true,
      currency: shopifyResult.order.currency,
      fields_cleaned: {
        first_name: finalFirstName !== first_name,
        last_name: finalLastName !== last_name,
        email: finalEmail !== (email || "").trim().toLowerCase(),
        address1: cleanAddress1 !== address1,
        city: cleanCity !== city,
      },
    });

    // ✅ RESPUESTA CON CAMPOS LIMPIOS
    return json(
      {
        success: true,
        type: "order_confirmation",
        requestId: requestId, // ✅ INCLUIR REQUEST ID EN RESPUESTA
        message: hasCompleteData
          ? "✅ Orden registrada exitosamente - Nos contactaremos contigo a la brevedad para confirmar tu pedido por llamada."
          : "✅ Orden registrada exitosamente con tu número de teléfono. Te contactaremos para completar los datos de envío y confirmar tu pedido.",
        orderConfirmation: {
          id: orderConfirmation.id,
          status: orderConfirmation.status,
          total: orderConfirmation.order_total.toString(),
          currency: shopifyResult.order.currency,
          expiresAt: orderConfirmation.expires_at,
          createdAt: orderConfirmation.created_at,
          shopifyOrderId: shopifyOrderId,
          shopifyOrderName: shopifyOrderName,
          hasCompleteData: hasCompleteData,
        },
        customer: {
          name: orderConfirmation.customer_name,
          email: finalEmail,
          phone: phone,
          country: detectedCountry,
          province: detectedProvince,
          isTemporaryEmail:
            finalEmail.includes("nobrinda@") ||
            finalEmail.includes("@temp.") ||
            finalEmail !== (email || "").trim().toLowerCase(),
        },
        shippingAddress: {
          city: finalCity,
          country: detectedCountry,
          province: detectedProvince,
          needsConfirmation: cleanAddress1 === "", // ✅ true si dirección estaba vacía/inválida
        },
        items: [
          {
            id: "temp_1",
            title: product_name,
            quantity: itemQuantity,
            price: price,
            variantId: variant_id,
          },
        ],
        tracking: {
          confirmationId: orderConfirmation.id,
          shopifyOrderId: shopifyOrderId,
          shopifyOrderName: shopifyOrderName,
        },
        nextSteps: {
          message: hasCompleteData
            ? "Nos contactaremos contigo para confirmar tu pedido."
            : "Te contactaremos para completar los datos de envío y confirmar tu pedido.",
          callScheduled: true,
          expiresAt: orderConfirmation.expires_at,
          isPreOrder: false,
          requiresConfirmation: true,
          requiresDataCompletion: !hasCompleteData,
          status: orderConfirmation.status,
          estimatedCallTime: "a la brevedad",
          shopifyCreated: true,
          shopCurrency: shopifyResult.order.currency,
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

// ✅ FUNCIÓN PARA DETECTAR PAÍS Y PROVINCIA (SIN CAMBIOS)
function detectCountryAndProvince(
  city: string | undefined,
  receivedCountry: string | undefined,
  receivedProvince: string | undefined,
): CountryProvinceResult {
  const cityLower = (city || "").toLowerCase().trim();
  let finalCountry = receivedCountry || "";
  let finalProvince = receivedProvince || "";

  logger.info("Ciudad recibida:", cityLower);
  logger.info("País recibido:", receivedCountry);
  logger.info("Provincia recibida:", receivedProvince);

  if (!finalCountry || finalCountry.trim() === "") {
    const colombiaCities = [
      "bogotá",
      "bogota",
      "medellín",
      "medellin",
      "cali",
      "barranquilla",
      "cartagena",
      "bucaramanga",
    ];
    const peruCities = [
      "lima",
      "arequipa",
      "cusco",
      "trujillo",
      "piura",
      "chiclayo",
      "huancayo",
      "iquitos",
      "tacna",
      "ayacucho",
    ];
    const mexicoCities = [
      "ciudad de méxico",
      "guadalajara",
      "monterrey",
      "puebla",
      "tijuana",
      "león",
      "juárez",
    ];

    if (colombiaCities.some((colCity) => cityLower.includes(colCity))) {
      finalCountry = "CO";
      if (cityLower.includes("bogotá") || cityLower.includes("bogota")) {
        finalProvince = "Cundinamarca";
      } else if (
        cityLower.includes("medellín") ||
        cityLower.includes("medellin")
      ) {
        finalProvince = "Antioquia";
      } else if (cityLower.includes("cali")) {
        finalProvince = "Valle del Cauca";
      } else if (cityLower.includes("barranquilla")) {
        finalProvince = "Atlántico";
      } else if (cityLower.includes("cartagena")) {
        finalProvince = "Bolívar";
      }
    } else if (peruCities.some((peruCity) => cityLower.includes(peruCity))) {
      finalCountry = "PE";
      if (cityLower.includes("lima")) {
        finalProvince = "Lima";
      } else if (cityLower.includes("arequipa")) {
        finalProvince = "Arequipa";
      } else if (cityLower.includes("cusco")) {
        finalProvince = "Cusco";
      } else if (cityLower.includes("ayacucho")) {
        finalProvince = "Ayacucho";
      }
    } else if (mexicoCities.some((mexCity) => cityLower.includes(mexCity))) {
      finalCountry = "MX";
      if (cityLower.includes("ciudad de méxico")) {
        finalProvince = "Ciudad de México";
      } else if (cityLower.includes("guadalajara")) {
        finalProvince = "Jalisco";
      } else if (cityLower.includes("monterrey")) {
        finalProvince = "Nuevo León";
      }
    } else {
      finalCountry = "PE";
      finalProvince = "Lima";
    }
  }

  logger.info("País final:", finalCountry);
  logger.info("Provincia final:", finalProvince);

  return { country: finalCountry, province: finalProvince };
}
