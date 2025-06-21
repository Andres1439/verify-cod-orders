// app/routes/api.orders.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const body = await request.json();
    const { shopDomain, customerInfo, lineItems, note } = body;

    console.log("[API Orders] Creando orden para:", shopDomain);

    // 1. Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
    });

    if (!shop || !shop.access_token) {
      return json(
        { error: "Tienda no encontrada o no autorizada." },
        { status: 404, headers },
      );
    }

    // 2. Buscar o crear cliente
    let customerId = null;

    // Buscar cliente existente (con campo actualizado)
    const searchCustomerQuery = `#graphql
      query getCustomer($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              defaultEmailAddress {
                emailAddress
              }
              firstName
              lastName
            }
          }
        }
      }
    `;

    let customerResponse = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shop.access_token,
        },
        body: JSON.stringify({
          query: searchCustomerQuery,
          variables: { query: `email:${customerInfo.email}` },
        }),
      },
    );

    let customerData = await customerResponse.json();

    if (customerData.data.customers.edges.length > 0) {
      // Cliente existe
      customerId = customerData.data.customers.edges[0].node.id;
      console.log("[API Orders] Cliente existente encontrado:", customerId);
    } else {
      // Crear nuevo cliente
      const createCustomerQuery = `#graphql
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              defaultEmailAddress {
                emailAddress
              }
              firstName
              lastName
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      customerResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shop.access_token,
          },
          body: JSON.stringify({
            query: createCustomerQuery,
            variables: {
              input: {
                firstName: customerInfo.firstName,
                lastName: customerInfo.lastName,
                email: customerInfo.email,
                phone: customerInfo.phone,
                addresses: customerInfo.address ? [customerInfo.address] : [],
              },
            },
          }),
        },
      );

      customerData = await customerResponse.json();

      if (customerData.data.customerCreate.userErrors.length > 0) {
        return json(
          {
            error: "Error al crear cliente",
            details: customerData.data.customerCreate.userErrors,
          },
          { status: 400, headers },
        );
      }

      customerId = customerData.data.customerCreate.customer.id;
      console.log("[API Orders] Nuevo cliente creado:", customerId);
    }

    // 3. Crear draft order (con campos corregidos)
    const draftOrderQuery = `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            order {
              id
              name
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
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
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderResponse = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shop.access_token,
        },
        body: JSON.stringify({
          query: draftOrderQuery,
          variables: {
            input: {
              lineItems: lineItems, // [{ variantId: "gid://...", quantity: 1 }]
              customerId: customerId,
              note: note || "Creado desde chatbot",
              useCustomerDefaultAddress: true,
              appliedDiscount: null,
            },
          },
        }),
      },
    );

    const draftOrderData = await draftOrderResponse.json();

    if (draftOrderData.data.draftOrderCreate.userErrors.length > 0) {
      return json(
        {
          error: "Error al crear la orden",
          details: draftOrderData.data.draftOrderCreate.userErrors,
        },
        { status: 400, headers },
      );
    }

    const draftOrder = draftOrderData.data.draftOrderCreate.draftOrder;

    // 4. Guardar en base de datos para seguimiento
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: `CHAT-${Date.now()}`,
        shopify_order_id: draftOrder.id,
        customer_phone: customerInfo.phone || "",
        customer_name: `${customerInfo.firstName} ${customerInfo.lastName}`,
        customer_email: customerInfo.email,
        order_items: lineItems,
        order_total: parseFloat(draftOrder.totalPriceSet.shopMoney.amount),
        source: "CHATBOT_STORE",
        status: "PENDING_CALL",
      },
    });

    console.log("[API Orders] Orden creada exitosamente:", draftOrder.name);

    // 5. Respuesta para n8n/chatbot
    return json(
      {
        success: true,
        order: {
          id: draftOrder.id,
          name: draftOrder.name,
          checkoutUrl: draftOrder.invoiceUrl,
          orderUrl: draftOrder.order?.id
            ? `https://${shopDomain}/admin/orders/${draftOrder.order.id.split("/").pop()}`
            : null,
          total: draftOrder.totalPriceSet.shopMoney.amount,
          currency: draftOrder.totalPriceSet.shopMoney.currencyCode,
          items: draftOrder.lineItems.edges.map((edge: any) => ({
            title: edge.node.title,
            quantity: edge.node.quantity,
            price: edge.node.originalUnitPriceSet.shopMoney.amount,
          })),
        },
        customer: {
          id: customerId,
          name: `${customerInfo.firstName} ${customerInfo.lastName}`,
          email: customerInfo.email,
        },
        tracking: {
          internalOrderNumber: orderConfirmation.internal_order_number,
          confirmationId: orderConfirmation.id,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("[API Orders] Error:", error);
    return json(
      {
        error: "Error interno del servidor al crear la orden.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers },
    );
  }
};
