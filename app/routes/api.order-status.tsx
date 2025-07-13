// app/routes/api.order-status.tsx (VERSIÓN QUE FUNCIONA SIN SHOPIFY)
// Reemplaza tu archivo actual con este código

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");
    const orderNumber = url.searchParams.get("orderNumber");
    const customerPhone = url.searchParams.get("customerPhone");

    console.log("[API Order Status] 🔍 Consulta recibida:", {
      shopDomain,
      orderNumber,
      customerPhone: customerPhone ? "***" + customerPhone.slice(-4) : null,
    });

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

    // 🔍 BUSCAR LA TIENDA (SIN VERIFICAR TOKEN)
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop) {
      console.error("[API Order Status] ❌ Tienda no encontrada:", shopDomain);
      return json(
        {
          error: "Tienda no encontrada",
          message: `La tienda ${shopDomain} no está registrada en nuestro sistema`,
        },
        { status: 404, headers },
      );
    }

    console.log("[API Order Status] ✅ Tienda encontrada:", {
      shopId: shop.id,
      domain: shop.shop_domain,
    });

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

    console.log("[API Order Status] 📱 Patrones de teléfono:", {
      original: originalPhone,
      totalPatterns: phonePatterns.length,
      samplePatterns: phonePatterns.slice(0, 3),
    });

    // 🔍 BUSCAR EN BASE DE DATOS INTERNA
    console.log("[API Order Status] 🔍 Buscando en base de datos interna...");

    const internalOrders = await db.orderConfirmation.findMany({
      where: {
        shop_id: shop.id,
        OR: [
          // Buscar por número de orden
          { internal_order_number: orderNumber },
          { internal_order_number: `#${orderNumber}` },
          { internal_order_number: { contains: orderNumber } },
          { shopify_order_id: { contains: orderNumber } },

          // Buscar por combinación de teléfono y orden
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
            // También buscar solo por teléfono si coincide exactamente
            { customer_phone: pattern },
          ]),
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      take: 5, // Máximo 5 resultados
    });

    console.log("[API Order Status] 📋 Resultados de búsqueda:", {
      totalFound: internalOrders.length,
      orderIds: internalOrders.map((o) => o.id),
      orderNumbers: internalOrders.map((o) => o.internal_order_number),
    });

    // 🎯 FILTRAR POR TELÉFONO SI HAY MÚLTIPLES RESULTADOS
    let matchingOrders = internalOrders;

    if (internalOrders.length > 1) {
      // Si hay múltiples órdenes, filtrar por teléfono más estrictamente
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

      console.log("[API Order Status] 📱 Después de filtrar por teléfono:", {
        before: internalOrders.length,
        after: matchingOrders.length,
      });
    }

    // 🎯 SELECCIONAR LA MEJOR COINCIDENCIA
    let selectedOrder = null;

    if (matchingOrders.length > 0) {
      // Priorizar por exactitud del número de orden
      selectedOrder =
        matchingOrders.find(
          (order) =>
            order.internal_order_number === orderNumber ||
            order.internal_order_number === `#${orderNumber}`,
        ) || matchingOrders[0]; // Si no hay coincidencia exacta, tomar la primera

      console.log("[API Order Status] ✅ Orden seleccionada:", {
        id: selectedOrder.id,
        internalNumber: selectedOrder.internal_order_number,
        phone: selectedOrder.customer_phone,
        status: selectedOrder.status,
      });
    }

    // 🎯 INTENTAR SHOPIFY SOLO SI NO ENCONTRAMOS NADA Y HAY TOKEN
    let shopifyAttempted = false;
    let shopifyError = null;

    if (!selectedOrder && shop.access_token) {
      console.log("[API Order Status] 🔗 Intentando búsqueda en Shopify...");
      shopifyAttempted = true;

      try {
        const orderQuery = `#graphql
          query getOrder($query: String!) {
            orders(first: 3, query: $query) {
              edges {
                node {
                  id
                  name
                  phone
                  email
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
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
          `https://${shopDomain}/admin/api/2024-10/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": shop.access_token,
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
            const orderPhones = [
              shopifyOrder.phone,
              shopifyOrder.customer?.phone,
            ].filter(Boolean);

            // Verificar teléfono
            const phoneMatch = phonePatterns.some((pattern) =>
              orderPhones.some(
                (orderPhone) =>
                  orderPhone?.includes(pattern) ||
                  pattern.includes(orderPhone?.replace(/[^\d]/g, "") || ""),
              ),
            );

            if (phoneMatch) {
              console.log("[API Order Status] ✅ Orden encontrada en Shopify");
              return json(
                {
                  success: true,
                  source: "shopify",
                  order: formatShopifyOrder(shopifyOrder),
                },
                { headers },
              );
            } else {
              shopifyError = "phone_mismatch";
            }
          } else {
            shopifyError = "not_found";
          }
        } else {
          shopifyError = `http_${response.status}`;
        }
      } catch (error) {
        shopifyError = "connection_error";
        console.log("[API Order Status] ⚠️ Error Shopify:", error);
      }
    }

    // 🎯 RESPONDER SEGÚN LO ENCONTRADO
    if (selectedOrder) {
      // ✅ ORDEN ENCONTRADA EN BD INTERNA
      console.log("[API Order Status] ✅ Respondiendo con orden interna");

      return json(
        {
          success: true,
          source: "internal_database",
          order: formatInternalOrder(selectedOrder, orderNumber),
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  searchResults: internalOrders.length,
                  phonePatterns: phonePatterns.length,
                  shopifyAttempted,
                }
              : undefined,
        },
        { headers },
      );
    } else {
      // ❌ NO ENCONTRADA
      console.log("[API Order Status] ❌ Orden no encontrada");

      const suggestions = [
        "Verifica que el número de orden sea correcto (ej: 1042, #1042)",
        "Asegúrate de usar el mismo teléfono con código de país del pedido",
        "El teléfono debe incluir el código de país (ej: 51907794432 para Perú)",
      ];

      if (shopifyAttempted && shopifyError) {
        suggestions.push(
          "⚠️ También intentamos buscar en Shopify pero no encontramos coincidencias",
        );
      }

      return json(
        {
          error: "Orden no encontrada",
          message: `No encontramos la orden ${orderNumber} con el teléfono ${customerPhone}.`,
          suggestions,
          help: "Si los datos son correctos, puedes contactar con nuestro soporte",
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  searchedInDatabase: true,
                  resultsFound: internalOrders.length,
                  shopifyAttempted,
                  shopifyError,
                  phonePatterns,
                }
              : undefined,
        },
        { status: 404, headers },
      );
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

// 🎯 FUNCIONES PARA FORMATEAR RESPUESTAS
function formatInternalOrder(order: any, requestedOrderNumber: string) {
  return {
    id: order.shopify_order_id || "DRAFT",
    orderNumber: order.internal_order_number || `#${requestedOrderNumber}`,
    status: {
      payment: "PENDING_PAYMENT",
      fulfillment: "UNFULFILLED",
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
      amount: order.order_total?.toString() || "0",
      currency: "USD",
      formatted: `$${order.order_total || 0} USD`,
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
      name: `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim(),
      email: order.email || "",
      phone: order.phone || order.customer?.phone,
    },
    total: {
      amount: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      formatted: `$${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`,
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
  };
}

function formatOrderItems(items: any, fallbackTotal?: number): any[] {
  if (!items) {
    return [
      {
        title: "Producto",
        quantity: 1,
        price: fallbackTotal?.toString() || "0",
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
          price: fallbackTotal?.toString() || "0",
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
