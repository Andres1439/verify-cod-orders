// app/routes/api.order-status.tsx
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
    const customerName = url.searchParams.get("customerName");
    const customerEmail = url.searchParams.get("customerEmail");

    console.log("[API Order Status] Consulta recibida:", {
      shopDomain,
      orderNumber,
      customerName: customerName ? "***" : null,
      customerEmail: customerEmail ? "***" : null,
    });

    if (!shopDomain || !orderNumber || !customerName || !customerEmail) {
      return json(
        {
          error:
            "Parámetros requeridos: shop, orderNumber, customerName, customerEmail",
          received: {
            shopDomain: !!shopDomain,
            orderNumber: !!orderNumber,
            customerName: !!customerName,
            customerEmail: !!customerEmail,
          },
        },
        { status: 400, headers },
      );
    }

    // Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
    });

    if (!shop || !shop.access_token) {
      console.error("[API Order Status] Tienda no encontrada:", shopDomain);
      return json(
        { error: "Tienda no encontrada o no autorizada." },
        { status: 404, headers },
      );
    }

    // También buscar en nuestra base de datos interna para órdenes del chatbot
    const internalOrder = await db.orderConfirmation.findFirst({
      where: {
        shop_id: shop.id,
        customer_email: customerEmail,
        customer_name: {
          contains: customerName,
          mode: "insensitive",
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    // Consulta GraphQL corregida con campos actualizados
    const orderQuery = `#graphql
      query getOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              email
              phone
              createdAt
              updatedAt
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
                defaultEmailAddress {
                  emailAddress
                }
              }
              shippingAddress {
                address1
                city
                province
                country
                zip
              }
              lineItems(first: 10) {
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
              fulfillments(first: 5) {
                trackingInfo {
                  company
                  number
                  url
                }
                status
                updatedAt
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
          "X-Shopify-Access-Token": shop.access_token,
        },
        body: JSON.stringify({
          query: orderQuery,
          variables: { query: `name:${orderNumber}` },
        }),
      },
    );

    const data = await response.json();

    if (data.errors) {
      console.error("[API Order Status] GraphQL Errors:", data.errors);
      return json(
        {
          error: "Error al consultar la orden",
          details: data.errors,
        },
        { status: 500, headers },
      );
    }

    const orders = data.data.orders.edges;

    if (orders.length === 0) {
      // Si no se encuentra en Shopify, verificar si es una orden draft/pendiente en nuestra BD
      if (internalOrder) {
        return json(
          {
            success: true,
            order: {
              id: internalOrder.shopify_order_id,
              orderNumber: internalOrder.internal_order_number,
              status: {
                payment: "PENDING",
                fulfillment: "UNFULFILLED",
                internal: internalOrder.status,
              },
              customer: {
                name: internalOrder.customer_name,
                email: internalOrder.customer_email,
                phone: internalOrder.customer_phone,
              },
              total: {
                amount: internalOrder.order_total.toString(),
                currency: "USD",
              },
              items: internalOrder.order_items,
              shippingAddress: internalOrder.shipping_address,
              tracking: null,
              dates: {
                created: internalOrder.created_at,
                updated: internalOrder.updated_at,
              },
              type: "DRAFT_ORDER", // Indicar que es una orden draft
              message:
                "Esta orden está siendo procesada. Recibirás un enlace de pago pronto.",
            },
          },
          { headers },
        );
      }

      return json(
        {
          error: "Orden no encontrada",
          message:
            "No se encontró ninguna orden con ese número en nuestros registros",
        },
        { status: 404, headers },
      );
    }

    const order = orders[0].node;

    // Verificar que los datos del cliente coincidan
    const fullCustomerName =
      `${order.customer?.firstName || ""} ${order.customer?.lastName || ""}`.trim();

    // Usar el nuevo campo para email del cliente
    const customerEmailFromAPI =
      order.customer?.defaultEmailAddress?.emailAddress || order.email;

    if (
      fullCustomerName.toLowerCase() !== customerName.toLowerCase() ||
      customerEmailFromAPI.toLowerCase() !== customerEmail.toLowerCase()
    ) {
      console.warn("[API Order Status] Datos no coinciden:", {
        providedName: customerName,
        apiName: fullCustomerName,
        providedEmail: customerEmail,
        apiEmail: customerEmailFromAPI,
      });

      return json(
        {
          error: "Datos de verificación no coinciden",
          message: "El nombre o email proporcionado no coincide con la orden",
        },
        { status: 403, headers },
      );
    }

    // Formatear información de fulfillment/envío
    const trackingInfo =
      order.fulfillments?.length > 0
        ? {
            company: order.fulfillments[0].trackingInfo?.company,
            number: order.fulfillments[0].trackingInfo?.number,
            url: order.fulfillments[0].trackingInfo?.url,
            status: order.fulfillments[0].status,
            lastUpdate: order.fulfillments[0].updatedAt,
          }
        : null;

    // Respuesta formateada con campos actualizados
    const orderDetails = {
      id: order.id,
      orderNumber: order.name,
      status: {
        payment: order.displayFinancialStatus,
        fulfillment: order.displayFulfillmentStatus || "UNFULFILLED",
        // Agregar info de nuestra BD si existe
        ...(internalOrder && {
          internal: internalOrder.status,
          internalOrderNumber: internalOrder.internal_order_number,
        }),
      },
      customer: {
        name: fullCustomerName,
        email: customerEmailFromAPI,
        phone: order.phone,
      },
      total: {
        amount: order.totalPriceSet.shopMoney.amount,
        currency: order.totalPriceSet.shopMoney.currencyCode,
      },
      items: order.lineItems.edges.map((edge: any) => ({
        title: edge.node.title,
        quantity: edge.node.quantity,
        price: edge.node.originalUnitPriceSet.shopMoney.amount,
      })),
      shippingAddress: order.shippingAddress,
      tracking: trackingInfo,
      dates: {
        created: order.createdAt,
        updated: order.updatedAt,
      },
      type: "COMPLETED_ORDER", // Indicar que es una orden completada
    };

    console.log(
      `[API Order Status] ✅ Orden ${orderNumber} encontrada para ${customerName}`,
    );

    return json(
      {
        success: true,
        order: orderDetails,
      },
      { headers },
    );
  } catch (error) {
    console.error("[API Order Status] ❌ Error crítico:", error);
    return json(
      {
        error: "Error interno del servidor al consultar la orden.",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};
