// app/routes/api.orders.tsx - VERSIÓN SIMPLIFICADA
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

    // ✅ RECIBE PARÁMETROS PLANOS DIRECTAMENTE
    const {
      shopDomain,
      first_name,
      last_name,
      email,
      phone,
      address1,
      city,
      zip,
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

    // Preparar datos para la base de datos
    const customerName = `${first_name || "Cliente"} ${last_name || "Chatbot"}`;
    const shippingAddress = {
      firstName: first_name || "Cliente",
      lastName: last_name || "Chatbot",
      address1: address1 || "Dirección pendiente",
      city: city || "Lima",
      province: "LIM",
      country: "PE",
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
    });

    // Respuesta exitosa
    return json(
      {
        success: true,
        type: "order_confirmation",
        orderConfirmation: {
          id: orderConfirmation.id,
          internalOrderNumber: orderConfirmation.internal_order_number,
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
          internalOrderNumber: orderConfirmation.internal_order_number,
          shopifyOrderId: null,
          shopifyOrderName: null,
        },
        nextSteps: {
          message: `📋 Pre-orden ${orderConfirmation.internal_order_number} registrada exitosamente.\n\n📞 Un agente te contactará en las próximas 2 horas para confirmar tu pedido y procesar el pago.\n\n⏱️ Esta pre-orden expira el ${orderConfirmation.expires_at?.toLocaleDateString("es-PE")}.`,
          callScheduled: true,
          expiresAt: orderConfirmation.expires_at,
          isPreOrder: true,
          requiresConfirmation: true,
          status: "PENDING_CALL",
          estimatedCallTime: "2 horas",
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("[API Orders] ❌ Error crítico:", error);
    return json(
      {
        error: "Error interno del servidor al crear la pre-orden",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};
