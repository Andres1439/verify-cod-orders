// app/routes/api.orders.tsx - CORREGIDA CON COUNTRY Y PROVINCE
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

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

    // ✅ AGREGAR country y province AL DESTRUCTURING
    const {
      shopDomain,
      first_name,
      last_name,
      email,
      phone,
      address1,
      city,
      zip,
      country, // ← AGREGAR ESTO
      province, // ← AGREGAR ESTO
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
      country, // ← MOSTRAR EN LOG
      province, // ← MOSTRAR EN LOG
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

    // Buscar tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
    });

    if (!shop) {
      return json(
        {
          error: "Tienda no encontrada",
        },
        { status: 404, headers },
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

    // ✅ FUNCIÓN PARA DETECTAR PAÍS Y PROVINCIA
    const detectCountryAndProvince = (
      city: string,
      receivedCountry: string,
      receivedProvince: string,
    ) => {
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
        } else if (
          peruCities.some((peruCity) => cityLower.includes(peruCity))
        ) {
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
        } else if (
          mexicoCities.some((mexCity) => cityLower.includes(mexCity))
        ) {
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
    };

    // ✅ APLICAR DETECCIÓN
    const { country: detectedCountry, province: detectedProvince } =
      detectCountryAndProvince(city, country, province);

    // Preparar datos para la base de datos
    const customerName = `${first_name || "Cliente"} ${last_name || "Chatbot"}`;
    const shippingAddress = {
      firstName: first_name || "Cliente",
      lastName: last_name || "Chatbot",
      address1: address1 || "Dirección pendiente",
      city: city || "Lima",
      province: detectedProvince, // ✅ USAR PROVINCIA DETECTADA
      country: detectedCountry, // ✅ USAR PAÍS DETECTADO
      zip: zip || "15001",
      phone: phone || "",
    };

    const lineItems = [
      {
        title: product_name,
        price: price,
        quantity: itemQuantity,
        variantId: variant_id,
        requiresShipping: true,
        taxable: true,
      },
    ];

    // Crear registro en OrderConfirmation
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: internalOrderNumber,
        shopify_order_id: null,
        customer_phone: phone || "",
        customer_name: customerName,
        customer_email: email,
        order_items: lineItems,
        order_total: orderTotal,
        shipping_address: shippingAddress,
        source: "CHATBOT_STORE",
        status: "PENDING_CALL",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    console.log("[API Orders] ✅ OrderConfirmation creada:", {
      id: orderConfirmation.id,
      internal_order_number: orderConfirmation.internal_order_number,
      customer_name: orderConfirmation.customer_name,
      total: orderConfirmation.order_total,
      status: orderConfirmation.status,
      country: detectedCountry, // ✅ MOSTRAR EN LOG
      province: detectedProvince, // ✅ MOSTRAR EN LOG
    });

    // Respuesta exitosa
    return json(
      {
        success: true,
        type: "order_confirmation",
        orderConfirmation: {
          id: orderConfirmation.id,
          status: orderConfirmation.status,
          total: orderConfirmation.order_total.toString(),
          currency: "USD",
          expiresAt: orderConfirmation.expires_at,
          createdAt: orderConfirmation.created_at,
        },
        customer: {
          name: orderConfirmation.customer_name,
          email: orderConfirmation.customer_email,
          phone: orderConfirmation.customer_phone,
          country: detectedCountry, // ✅ INCLUIR EN RESPUESTA
          province: detectedProvince, // ✅ INCLUIR EN RESPUESTA
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
          shopifyOrderId: null,
          shopifyOrderName: null,
        },
        nextSteps: {
          message: `✅ Orden registrada exitosamente - Nos contactaremos contigo a la brevedad, para confirmar tu pedido por llamada. Gracias por contactarnos`,
          callScheduled: true,
          expiresAt: orderConfirmation.expires_at,
          isPreOrder: true,
          requiresConfirmation: true,
          status: "PENDING_CALL",
          estimatedCallTime: "a la brevedad",
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
