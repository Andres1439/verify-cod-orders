// app/routes/api.orders.tsx - VERSIÓN CORREGIDA COMPLETA
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

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
  [key: string]: any; // ✅ SIGNATURA DE ÍNDICE PARA PRISMA JSON
}

interface ShopifyLineItem {
  variantId: string;
  quantity: number;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

// ✅ TIPOS PARA BASE DE DATOS (COMPATIBLES CON PRISMA JSON)
interface DBLineItem {
  title: string;
  price: string;
  quantity: number;
  variantId: string;
  requiresShipping: boolean;
  taxable: boolean;
  [key: string]: any; // ✅ SIGNATURA DE ÍNDICE PARA PRISMA JSON
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
}

interface CountryProvinceResult {
  country: string;
  province: string;
}

// ✅ FUNCIÓN PARA OBTENER LA MONEDA DE LA TIENDA
async function getShopCurrency(
  shopDomain: string,
  accessToken: string,
): Promise<string> {
  try {
    console.log(
      "[Shop Currency] 🔍 Obteniendo moneda de la tienda:",
      shopDomain,
    );

    // Usar GraphQL para obtener la moneda (más confiable)
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

    console.log("[Shop Currency] ✅ Información de la tienda:", {
      moneda: currency,
      país: shop.countryCode,
      nombre: shop.name,
    });

    return currency;
  } catch (error) {
    console.error("[Shop Currency] ❌ Error obteniendo moneda:", error);

    // ✅ FALLBACK: usar REST API si GraphQL falla
    try {
      const restResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
          },
        },
      );

      if (restResponse.ok) {
        const restResult = await restResponse.json();
        const fallbackCurrency = restResult.shop?.currency || "USD";
        console.log(
          "[Shop Currency] 🔄 Fallback REST API - Moneda:",
          fallbackCurrency,
        );
        return fallbackCurrency;
      }
    } catch (fallbackError) {
      console.error(
        "[Shop Currency] ❌ Fallback también falló:",
        fallbackError,
      );
    }

    // Por defecto USD
    return "USD";
  }
}

// ✅ FUNCIÓN PRINCIPAL: USAR REST API (MÁS SIMPLE Y CONFIABLE)
async function createShopifyOrder({
  shopDomain,
  accessToken,
  customerData,
  shippingAddress,
  lineItems,
  currency = "USD",
  note = "",
  itemPrice,
}: CreateShopifyOrderParams): Promise<ShopifyOrderResult> {
  try {
    console.log("[Shopify REST] 📤 Creando orden con REST API...");

    // ✅ OBTENER MONEDA DE LA TIENDA PRIMERO
    const shopCurrency = await getShopCurrency(shopDomain, accessToken);

    // ✅ CREAR ORDEN CON REST API - MUCHO MÁS SIMPLE
    const orderData = {
      order: {
        note: `${note} | Moneda tienda: ${shopCurrency}`,
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
        billing_address: {
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
          // ✅ MANEJAR VARIANT_ID CON O SIN GID
          variant_id: item.variantId.includes("gid://")
            ? item.variantId.replace("gid://shopify/ProductVariant/", "")
            : item.variantId,
          quantity: item.quantity,
          // ✅ NO especificar precio - Shopify usa el precio configurado del producto
          // price: itemPrice, // ❌ COMENTADO - causa problemas de currency
        })),
        // ✅ NO especificar currency - Shopify usa automáticamente la de la tienda
      },
    };

    console.log(
      "[Shopify REST] 📦 Datos a enviar:",
      JSON.stringify(orderData, null, 2),
    );
    console.log(
      "[Shopify REST] 💰 Moneda detectada de la tienda:",
      shopCurrency,
    );

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify(orderData),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("[Shopify REST] ❌ Error:", response.status, result);
      return {
        success: false,
        error: result.errors
          ? JSON.stringify(result.errors)
          : `HTTP ${response.status}`,
      };
    }

    const order = result.order;
    console.log("[Shopify REST] ✅ Orden creada exitosamente:", order.name);
    console.log("[Shopify REST] 💰 Moneda de la orden:", order.currency);

    return {
      success: true,
      order: {
        id: `gid://shopify/Order/${order.id}`,
        name: order.name,
        totalPrice: order.total_price,
        currency: order.currency, // ✅ Shopify devuelve la moneda correcta automáticamente
        customer: {
          id: order.customer?.id
            ? `gid://shopify/Customer/${order.customer.id}`
            : "",
          email: order.email,
        },
        lineItems: order.line_items.map((item: any) => ({
          id: `gid://shopify/LineItem/${item.id}`,
          title: item.title,
          quantity: item.quantity,
          variant: {
            id: `gid://shopify/ProductVariant/${item.variant_id}`,
          },
        })),
      },
    };
  } catch (error) {
    console.error("[Shopify REST] ❌ Error:", error);
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
      variant_id,
    } = body;

    console.log("[API Orders] 🛒 Creando OrderConfirmation para:", shopDomain);
    console.log("[API Orders] 📦 Datos recibidos:", {
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
      variant_id,
    });

    // Validación básica
    if (!shopDomain || !email || !product_name || !variant_id) {
      return json(
        {
          error:
            "Datos requeridos: shopDomain, email, product_name, variant_id",
          code: "MISSING_REQUIRED_FIELDS",
        },
        { status: 400, headers },
      );
    }

    // ✅ BUSCAR TIENDA CON ACCESS_TOKEN
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true, // ✅ NECESARIO PARA SHOPIFY API
      },
    });

    if (!shop) {
      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    if (!shop.access_token) {
      console.error("[API Orders] ❌ Access token no disponible");
      return json(
        { error: "Token de acceso no disponible para la tienda" },
        { status: 400, headers },
      );
    }

    console.log("[API Orders] ✅ Tienda encontrada:", shop.id);

    // Calcular total del pedido
    const itemPrice = parseFloat(price) || 0;
    const itemQuantity = parseInt(quantity) || 1;
    const orderTotal = itemPrice * itemQuantity;

    // Generar número de orden interno único
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const internalOrderNumber = `ORD-${timestamp}-${random}`;

    // ✅ DETECTAR PAÍS Y PROVINCIA
    const { country: detectedCountry, province: detectedProvince } =
      detectCountryAndProvince(city, country, province);

    // ✅ PREPARAR DATOS PARA SHOPIFY
    const customerData: ShopifyCustomerData = {
      firstName: first_name || "Cliente",
      lastName: last_name || "Chatbot",
      email: email,
      phone: phone || "",
    };

    const shippingAddress: ShopifyShippingAddress = {
      firstName: first_name || "Cliente",
      lastName: last_name || "Chatbot",
      address1: address1 || "Dirección pendiente",
      city: city || "Lima",
      province: detectedProvince,
      country: detectedCountry,
      zip: zip || "15001",
      phone: phone || "",
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

    // ✅ 1. CREAR ORDEN DIRECTAMENTE EN SHOPIFY PRIMERO
    console.log("[API Orders] 📤 Creando orden directamente en Shopify...");

    const shopifyResult = await createShopifyOrder({
      shopDomain: shop.shop_domain,
      accessToken: shop.access_token,
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
          ],
        },
      ],
      currency: "USD",
      note: `Orden creada desde chatbot - ${internalOrderNumber}`,
      itemPrice: itemPrice,
    });

    // ✅ SI FALLA SHOPIFY, NO CONTINUAR
    if (!shopifyResult.success || !shopifyResult.order) {
      console.error(
        "[API Orders] ❌ Error al crear orden en Shopify:",
        shopifyResult.error,
      );
      return json(
        {
          success: false,
          error: "No se pudo crear la orden en Shopify",
          details: shopifyResult.error || "Respuesta de Shopify inválida",
        },
        { status: 500, headers },
      );
    }

    console.log(
      "[API Orders] ✅ Orden creada exitosamente en Shopify:",
      shopifyResult.order.name,
    );

    const shopifyOrderId = shopifyResult.order.id;
    const shopifyOrderName = shopifyResult.order.name;

    // ✅ 2. GUARDAR EN BASE DE DATOS LOCAL (SOLO SI SHOPIFY TUVO ÉXITO)
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: internalOrderNumber,
        shopify_order_id: shopifyOrderId, // ✅ ID de Shopify
        shopify_order_name: shopifyOrderName, // ✅ Nombre de Shopify (#1001)
        customer_phone: phone || "",
        customer_name: `${first_name || "Cliente"} ${last_name || "Chatbot"}`,
        customer_email: email,
        order_items: lineItems as any, // ✅ CAST EXPLÍCITO PARA PRISMA JSON
        order_total: orderTotal,
        shipping_address: shippingAddress as any, // ✅ CAST EXPLÍCITO PARA PRISMA JSON
        source: "CHATBOT_STORE", // ✅ USAR TU ENUM EXISTENTE
        status: "PENDING_CALL", // ✅ USAR TU ENUM EXISTENTE - inicia como PENDING_CALL
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    console.log("[API Orders] ✅ OrderConfirmation creada:", {
      id: orderConfirmation.id,
      internal_order_number: orderConfirmation.internal_order_number,
      shopify_order_id: shopifyOrderId,
      shopify_order_name: shopifyOrderName,
      status: orderConfirmation.status,
      country: detectedCountry,
      province: detectedProvince,
      shopify_success: true,
      currency: shopifyResult.order.currency, // ✅ MOSTRAR LA MONEDA REAL USADA
    });

    // ✅ 3. RESPUESTA AL CLIENTE
    return json(
      {
        success: true,
        type: "order_confirmation",
        message:
          "✅ Orden registrada exitosamente - Nos contactaremos contigo a la brevedad, para confirmar tu pedido por llamada. Gracias por contactarnos",
        orderConfirmation: {
          id: orderConfirmation.id,
          status: orderConfirmation.status,
          total: orderConfirmation.order_total.toString(),
          currency: shopifyResult.order.currency, // ✅ USAR LA MONEDA REAL DE SHOPIFY
          expiresAt: orderConfirmation.expires_at,
          createdAt: orderConfirmation.created_at,
          shopifyOrderId: shopifyOrderId,
          shopifyOrderName: shopifyOrderName,
        },
        customer: {
          name: orderConfirmation.customer_name,
          email: orderConfirmation.customer_email,
          phone: orderConfirmation.customer_phone,
          country: detectedCountry,
          province: detectedProvince,
        },
        shippingAddress: {
          city: city,
          country: detectedCountry,
          province: detectedProvince,
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
          message:
            "✅ Orden registrada exitosamente - Nos contactaremos contigo a la brevedad, para confirmar tu pedido por llamada. Gracias por contactarnos",
          callScheduled: true,
          expiresAt: orderConfirmation.expires_at,
          isPreOrder: false, // ✅ NO es pre-orden porque ya se creó en Shopify
          requiresConfirmation: true,
          status: "PENDING_CALL", // ✅ USAR TU ESTADO EXISTENTE
          estimatedCallTime: "a la brevedad",
          shopifyCreated: true,
          shopCurrency: shopifyResult.order.currency, // ✅ INFORMAR LA MONEDA USADA
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("[API Orders] ❌ Error crítico:", error);
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

// ✅ FUNCIÓN PARA DETECTAR PAÍS Y PROVINCIA
function detectCountryAndProvince(
  city: string | undefined,
  receivedCountry: string | undefined,
  receivedProvince: string | undefined,
): CountryProvinceResult {
  const cityLower = (city || "").toLowerCase().trim();
  let finalCountry = receivedCountry || "";
  let finalProvince = receivedProvince || "";

  console.log("[Detección] Ciudad recibida:", cityLower);
  console.log("[Detección] País recibido:", receivedCountry);
  console.log("[Detección] Provincia recibida:", receivedProvince);

  // Si no hay país, detectar automáticamente
  if (!finalCountry || finalCountry.trim() === "") {
    // Ciudades de Colombia
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
    // Ciudades de Perú
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
    // Ciudades de México
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
      // Detectar departamento de Colombia
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
      // Detectar departamento de Perú
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
      // Detectar estado de México
      if (cityLower.includes("ciudad de méxico")) {
        finalProvince = "Ciudad de México";
      } else if (cityLower.includes("guadalajara")) {
        finalProvince = "Jalisco";
      } else if (cityLower.includes("monterrey")) {
        finalProvince = "Nuevo León";
      }
    } else {
      // Por defecto Perú
      finalCountry = "PE";
      finalProvince = "Lima";
    }
  }

  console.log("[Detección] País final:", finalCountry);
  console.log("[Detección] Provincia final:", finalProvince);

  return { country: finalCountry, province: finalProvince };
}
