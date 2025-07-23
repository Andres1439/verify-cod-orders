// app/routes/api.order-status.tsx - CON ORDER STATUS URL INTEGRADO
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { decimalToString, decimalToCurrency } from "../utils/decimal-utils";
import { decryptToken } from "../utils/encryption.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");
    const orderNumber = url.searchParams.get("orderNumber");
    const customerPhone = url.searchParams.get("customerPhone");

    // 🎯 VALIDACIÓN BÁSICA
    if (!shopDomain || !orderNumber || !customerPhone) {
      return json(
        {
          error: "Parámetros requeridos",
          message:
            "Para consultar tu pedido necesitamos el número de orden y tu teléfono con código de país",
          required: ["shop", "orderNumber", "customerPhone"],
          example:
            "?shop=tienda.myshopify.com&orderNumber=1042&customerPhone=51907794432",
        },
        { status: 400, headers },
      );
    }

    // 🔍 BUSCAR LA TIENDA
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop) {
      return json(
        {
          error: "Tienda no encontrada",
          message: `La tienda ${shopDomain} no está registrada en nuestro sistema`,
        },
        { status: 404, headers },
      );
    }

    // 🎯 PREPARAR PATRONES DE BÚSQUEDA DE TELÉFONO
    const originalPhone = customerPhone;
    const cleanPhone = customerPhone.replace(/[^\d]/g, "");

    // Generar múltiples patrones para buscar
    const phonePatterns = [
      originalPhone, // "51907794432"
      cleanPhone, // "51907794432"
      "+" + cleanPhone, // "+51907794432"
      cleanPhone.replace(/^51/, ""), // "907794432" (sin código Perú)
      cleanPhone.replace(/^57/, ""), // sin código Colombia
      cleanPhone.replace(/^52/, ""), // sin código México
    ].filter((pattern, index, self) => self.indexOf(pattern) === index); // Únicos

    // 🔍 BUSCAR EN BASE DE DATOS INTERNA
    const internalOrders = await db.orderConfirmation.findMany({
      where: {
        shop_id: shop.id,
        OR: [
          { internal_order_number: orderNumber },
          { internal_order_number: `#${orderNumber}` },
          { internal_order_number: { contains: orderNumber } },
          { shopify_order_id: { contains: orderNumber } },
          ...phonePatterns.flatMap((pattern) => [
            {
              AND: [
                { customer_phone: { contains: pattern } },
                {
                  OR: [
                    { internal_order_number: { contains: orderNumber } },
                    { shopify_order_id: { contains: orderNumber } },
                  ],
                },
              ],
            },
            { customer_phone: pattern },
          ]),
        ],
      },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    // 🎯 FILTRAR POR TELÉFONO SI HAY MÚLTIPLES RESULTADOS
    let matchingOrders = internalOrders;
    if (internalOrders.length > 1) {
      matchingOrders = internalOrders.filter((order) => {
        if (!order.customer_phone) return false;
        const orderCleanPhone = order.customer_phone.replace(/[^\d]/g, "");
        return phonePatterns.some((pattern) => {
          const patternClean = pattern.replace(/[^\d]/g, "");
          return (
            order.customer_phone === pattern ||
            orderCleanPhone === patternClean ||
            orderCleanPhone.endsWith(patternClean.slice(-8)) ||
            patternClean.endsWith(orderCleanPhone.slice(-8))
          );
        });
      });
    }

    // 🎯 SELECCIONAR LA MEJOR COINCIDENCIA
    let selectedOrder = null;
    if (matchingOrders.length > 0) {
      selectedOrder =
        matchingOrders.find(
          (order) =>
            order.internal_order_number === orderNumber ||
            order.internal_order_number === `#${orderNumber}`,
        ) || matchingOrders[0];
    }

    // ✨ NUEVA FUNCIONALIDAD: OBTENER SHOPIFY ORDER STATUS URL
    let shopifyStatusUrl = null;
    let shopifyAttempted = false;
    let shopifyError = null;

    // 🎯 INTENTAR SHOPIFY (SIEMPRE SI HAY TOKEN, PARA OBTENER STATUS URL)
    if (shop.access_token) {
      shopifyAttempted = true;

      try {
        // Desencriptar token si es necesario
        let accessToken = shop.access_token;
        try {
          const parsed = JSON.parse(shop.access_token);
          if (parsed.encrypted && parsed.iv && parsed.tag) {
            accessToken = decryptToken(parsed);
          }
        } catch {
          // Token no encriptado, usar tal como viene
        }

        // ✨ QUERY MEJORADO: Incluir statusPageUrl para obtener el enlace de seguimiento
        const orderQuery = `#graphql
          query getOrderWithStatusUrl($query: String!) {
            orders(first: 3, query: $query) {
              edges {
                node {
                  id
                  name
                  email
                  phone
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  statusPageUrl
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  customer {
                    firstName
                    lastName
                    phone
                    defaultPhoneNumber {
                      phoneNumber
                    }
                  }
                  lineItems(first: 5) {
                    edges {
                      node {
                        title
                        quantity
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
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
              "User-Agent": "VerifyCODOrders/1.0",
            },
            body: JSON.stringify({
              query: orderQuery,
              variables: { query: `name:${orderNumber.replace("#", "")}` },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          
          if (!data.errors && data.data?.orders?.edges?.length > 0) {
            const shopifyOrder = data.data.orders.edges[0].node;
            
            // Recopilar todos los teléfonos de la orden
            const orderPhones = [
              shopifyOrder.phone,
              shopifyOrder.customer?.phone,
              shopifyOrder.customer?.defaultPhoneNumber?.phoneNumber,
            ].filter(Boolean);

            // Verificar teléfono
            const phoneMatch = phonePatterns.some((pattern) =>
              orderPhones.some((orderPhone) => {
                const cleanOrderPhone = orderPhone?.replace(/[^\d]/g, "") || "";
                const cleanPattern = pattern.replace(/[^\d]/g, "");
                return (
                  orderPhone?.includes(pattern) ||
                  pattern.includes(cleanOrderPhone) ||
                  cleanOrderPhone.endsWith(cleanPattern.slice(-8)) ||
                  cleanPattern.endsWith(cleanOrderPhone.slice(-8))
                );
              })
            );

            if (phoneMatch) {
              // ✅ ORDEN ENCONTRADA EN SHOPIFY CON TELÉFONO VÁLIDO
              const formattedOrder = formatShopifyOrder(shopifyOrder);
              
              // ✨ AGREGAR STATUS URL SI ESTÁ DISPONIBLE
              if (shopifyOrder.statusPageUrl) {
                formattedOrder.trackingUrl = shopifyOrder.statusPageUrl;
                formattedOrder.trackingMessage = "¡Haz clic aquí para seguir tu pedido en tiempo real!";
              }

              return json({
                success: true,
                source: "shopify",
                order: formattedOrder,
                trackingUrl: shopifyOrder.statusPageUrl || null,
                message: shopifyOrder.statusPageUrl 
                  ? "Orden encontrada. Aquí tienes el enlace para seguir tu pedido."
                  : "Orden encontrada, pero el enlace de seguimiento no está disponible.",
              }, { headers });
            } else {
              shopifyError = "phone_mismatch";
              // Guardar la URL aunque no coincida el teléfono, por si acaso
              shopifyStatusUrl = shopifyOrder.statusPageUrl;
            }
          } else {
            shopifyError = "not_found";
          }
        } else {
          shopifyError = `http_${response.status}`;
        }
      } catch (error) {
        console.error("[Order Status] Error en Shopify:", error);
        shopifyError = "connection_error";

      }
    }

    // 🎯 RESPONDER SEGÚN LO ENCONTRADO
    if (selectedOrder) {
      // ✅ ORDEN ENCONTRADA EN BD INTERNA
      const formattedOrder = formatInternalOrder(selectedOrder, orderNumber);
      
      // ✨ AGREGAR TRACKING URL DE SHOPIFY SI ESTÁ DISPONIBLE
      if (shopifyStatusUrl) {
        formattedOrder.trackingUrl = shopifyStatusUrl;
        formattedOrder.trackingMessage = "También puedes seguir tu pedido en Shopify:";
      }

      return json({
        success: true,
        source: "internal_database",
        order: formattedOrder,
        trackingUrl: shopifyStatusUrl || null,
        message: shopifyStatusUrl 
          ? "Pedido encontrado. También incluimos el enlace de seguimiento de Shopify."
          : "Pedido encontrado en nuestra base de datos.",
        debug: process.env.NODE_ENV === "development" ? {
          searchResults: internalOrders.length,
          phonePatterns: phonePatterns.length,
          shopifyAttempted,
          shopifyStatusUrl: !!shopifyStatusUrl,
        } : undefined,
      }, { headers });
    } else {
      // ❌ NO ENCONTRADA
      const suggestions = [
        "Verifica que el número de orden sea correcto (ej: 1042, #1042)",
        "Asegúrate de usar el mismo teléfono con código de país del pedido",
        "El teléfono debe incluir el código de país (ej: 51907794432 para Perú)",
      ];

      if (shopifyAttempted && shopifyError) {
        suggestions.push(
          `⚠️ También intentamos buscar en Shopify: ${getShopifyErrorMessage(shopifyError)}`,
        );
      }

      return json({
        error: "Orden no encontrada",
        message: `No encontramos la orden ${orderNumber} con el teléfono ${customerPhone}.`,
        suggestions,
        help: "Si los datos son correctos, puedes contactar con nuestro soporte",
        // ✨ INCLUIR TRACKING URL AUNQUE NO COINCIDA EL TELÉFONO (OPCIONAL)
        trackingUrl: shopifyStatusUrl || null,
        trackingNote: shopifyStatusUrl 
          ? "Encontramos una orden con este número pero con diferente teléfono. Usa este enlace solo si es tu pedido:"
          : null,
        debug: process.env.NODE_ENV === "development" ? {
          searchedInDatabase: true,
          resultsFound: internalOrders.length,
          shopifyAttempted,
          shopifyError,
          phonePatterns,
          shopifyStatusUrl: !!shopifyStatusUrl,
        } : undefined,
      }, { status: 404, headers });
    }
  } catch (error) {
    console.error("[API Order Status] ❌ Error crítico:", error);

    return json(
      {
        error: "Error interno",
        message:
          "Hubo un problema al procesar tu consulta. Por favor intenta nuevamente.",
        suggestions: [
          "Verifica que los datos estén correctos",
          "Intenta nuevamente en unos momentos",
          "Si persiste el problema, contacta con soporte",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};

// ✨ NUEVA FUNCIÓN: Mensajes de error de Shopify más amigables
function getShopifyErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    phone_mismatch: "Encontramos la orden pero el teléfono no coincide",
    not_found: "No encontramos la orden en Shopify",
    connection_error: "Error de conexión con Shopify",
  };
  
  if (error.startsWith("http_")) {
    return `Error de servidor (${error.replace("http_", "")})`;
  }
  
  return messages[error] || "Error desconocido";
}

// 🎯 FUNCIONES PARA FORMATEAR RESPUESTAS (MEJORADAS)
function formatInternalOrder(order: any, requestedOrderNumber: string) {
  return {
    id: order.shopify_order_id || "DRAFT",
    orderNumber: order.internal_order_number || `#${requestedOrderNumber}`,
    status: {
      internal: order.status,
      description: getInternalStatusDescription(order.status),
      statusColor: getStatusColor(order.status),
    },
    customer: {
      name: order.customer_name || "Cliente",
      email: order.customer_email || "",
      phone: order.customer_phone,
    },
    total: {
      amount: decimalToString(order.order_total),
      currency: "USD",
      formatted: decimalToCurrency(order.order_total),
    },
    items: formatOrderItems(order.order_items, order.order_total),
    shippingAddress: order.shipping_address || {},
    tracking: null,
    dates: {
      created: order.created_at,
      updated: order.updated_at,
      createdFormatted: new Date(order.created_at).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    type: "PROCESSING_ORDER",
    message: getOrderMessage(order.status),
    // ✨ PLACEHOLDER PARA TRACKING URL (se agregará después si está disponible)
    trackingUrl: null as string | null,
    trackingMessage: null as string | null,
  };
}

function formatShopifyOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.name,
    status: {
      payment: order.displayFinancialStatus || "PENDING",
      fulfillment: order.displayFulfillmentStatus || "UNFULFILLED",
      description: `${order.displayFinancialStatus} | ${order.displayFulfillmentStatus}`,
      statusColor: "blue",
    },
    customer: {
      name: `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim() || "Cliente",
      email: order.email || "",
      phone: order.phone || order.customer?.phone || order.customer?.defaultPhoneNumber?.phoneNumber,
    },
    total: {
      amount: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      formatted: `${order.totalPriceSet.shopMoney.currencyCode} ${order.totalPriceSet.shopMoney.amount}`,
    },
    items: order.lineItems.edges.map((edge: any) => ({
      title: edge.node.title,
      quantity: edge.node.quantity,
      price: edge.node.originalUnitPriceSet.shopMoney.amount,
      currency: edge.node.originalUnitPriceSet.shopMoney.currencyCode,
    })),
    dates: {
      created: order.createdAt,
      createdFormatted: new Date(order.createdAt).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
    type: "COMPLETED_ORDER",
    message: "Tu pedido ha sido procesado exitosamente",
    trackingUrl: order.statusPageUrl || null,
    trackingMessage: order.statusPageUrl ? "¡Haz clic aquí para seguir tu pedido en tiempo real!" : null,
  };
}

function formatOrderItems(items: any, fallbackTotal?: number): any[] {
  if (!items) {
    return [
      {
        title: "Producto",
        quantity: 1,
        price: decimalToString(fallbackTotal),
        currency: "USD",
      },
    ];
  }

  if (Array.isArray(items)) return items;

  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [
        {
          title: items,
          quantity: 1,
          price: decimalToString(fallbackTotal),
          currency: "USD",
        },
      ];
    }
  }

  return [items];
}

function getInternalStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    PENDING_CALL: "Esperando confirmación telefónica",
    CONFIRMED: "Confirmado - Procesando pago",
    DECLINED: "Pedido declinado",
    NO_ANSWER: "Sin respuesta - Reintentaremos",
    EXPIRED: "Expirado",
  };
  return descriptions[status] || status;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING_CALL: "orange",
    CONFIRMED: "green",
    DECLINED: "red",
    NO_ANSWER: "yellow",
    EXPIRED: "gray",
  };
  return colors[status] || "blue";
}

function getOrderMessage(status: string): string {
  const messages: Record<string, string> = {
    PENDING_CALL:
      "Tu pedido está en proceso. Te llamaremos pronto para confirmar.",
    CONFIRMED: "Tu pedido ha sido confirmado. Te enviaremos el enlace de pago.",
    DECLINED:
      "Este pedido fue declinado. Puedes hacer un nuevo pedido cuando gustes.",
    NO_ANSWER: "No pudimos contactarte. Te volveremos a llamar pronto.",
    EXPIRED:
      "Este pedido ha expirado. Contacta con soporte si necesitas ayuda.",
  };
  return messages[status] || "Tu pedido está siendo procesado.";
}
