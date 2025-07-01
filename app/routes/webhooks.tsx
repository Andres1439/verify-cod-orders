/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/webhooks.tsx

import type { ActionFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server"; // Tu cliente de Prisma conectado a Supabase
import { sendCustomerDataReportEmail } from "../services/email.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // `authenticate.webhook` valida la petición y devuelve el tópico, tienda y payload
    const { topic, shop, payload, admin } = await authenticate.webhook(request);

    // Esta línea es útil para ver en tu consola cada webhook que llega
    logger.webhook(topic, shop, "received");

    switch (topic) {
      // =================================================================
      // WEBHOOKS DE CUMPLIMIENTO OBLIGATORIOS
      // =================================================================
      case "CUSTOMERS_DATA_REQUEST":
        logger.info("Iniciando recopilación de datos de cliente", { shop });

        const { customer } = payload;

        if (!customer || (!customer.email && !customer.phone)) {
          logger.warn(
            "Payload de CUSTOMERS_DATA_REQUEST no contiene email ni teléfono",
            { shop },
          );
          return new Response(null, { status: 200 });
        }

        try {
          const whereClauseForOrders = {
            OR: [
              ...(customer.email ? [{ customer_email: customer.email }] : []),
              ...(customer.phone ? [{ customer_phone: customer.phone }] : []),
            ],
          };

          const [foundTickets, foundOrderConfirmations] = await Promise.all([
            db.ticket.findMany({
              where: {
                shop: { shop_domain: shop },
                customer_email: customer.email, // Ajuste de precisión: Ticket solo usa email
              },
            }),
            db.orderConfirmation.findMany({
              where: {
                shop: { shop_domain: shop },
                ...whereClauseForOrders,
              },
              include: { call: true },
            }),
          ]);

          const customerDataReport = {
            requestDetails: {
              shopDomain: shop,
              requestedAt: new Date().toISOString(),
              customerIdentifiers: {
                email: customer.email,
                phone: customer.phone,
                shopifyCustomerId: customer.id,
              },
            },
            dataFound: {
              tickets: foundTickets,
              orderConfirmations: foundOrderConfirmations,
            },
          };

          logger.info("Datos recopilados para cliente", {
            shop,
            ticketsCount: foundTickets.length,
            ordersCount: foundOrderConfirmations.length,
          });

          if (!admin) {
            throw new Error(
              "El contexto de Admin no está disponible para obtener el email de la tienda.",
            );
          }

          // Usamos el cliente 'admin' de GraphQL que nos da el webhook
          const response = await admin.graphql(
            `#graphql
                    query GetShopEmail {
                      shop {
                        email
                      }
                    }`,
          );

          const shopData = await response.json();
          const merchantEmail = shopData.data?.shop?.email;

          if (!merchantEmail) {
            throw new Error(
              `No se pudo obtener el email para la tienda ${shop}.`,
            );
          }

          // --- 3. ENVIAR EL EMAIL ---
          await sendCustomerDataReportEmail({
            shopDomain: shop,
            customerDataReport,
            merchantEmail,
          });

          logger.info("Proceso de recopilación completado", { shop });
        } catch (error) {
          logger.error("Error durante la recopilación de datos del cliente", {
            shop,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
        break;

      case "CUSTOMERS_REDACT":
        logger.info("Iniciando proceso de redacción de datos", { shop });

        const { customer: customerToRedact } = payload;

        if (
          !customerToRedact ||
          (!customerToRedact.email && !customerToRedact.phone)
        ) {
          logger.warn(
            "Payload de CUSTOMERS_REDACT no contiene email o teléfono",
            { shop },
          );
          return new Response(null, { status: 200 });
        }

        try {
          const whereClauseForRedact = {
            OR: [
              ...(customerToRedact.email
                ? [{ customer_email: customerToRedact.email }]
                : []),
              ...(customerToRedact.phone
                ? [{ customer_phone: customerToRedact.phone }]
                : []),
            ],
          };

          const transactionResult = await db.$transaction(async (prisma) => {
            const deletedTickets = await prisma.ticket.deleteMany({
              where: {
                shop: { shop_domain: shop },
                customer_email: customerToRedact.email, // Ajuste de precisión: Ticket solo usa email
              },
            });
            logger.info("Tickets eliminados", {
              shop,
              count: deletedTickets.count,
            });

            const updatedOrders = await prisma.orderConfirmation.updateMany({
              where: {
                shop: { shop_domain: shop },
                ...whereClauseForRedact,
              },
              data: {
                customer_phone: "[REDACTED]",
                customer_name: "[REDACTED]",
                customer_email: "[REDACTED]",
                shipping_address: Prisma.JsonNull,
              },
            });
            logger.info("Confirmaciones de pedido anonimizadas", {
              shop,
              count: updatedOrders.count,
            });

            return { deletedTickets, updatedOrders };
          });

          logger.info("Proceso de redacción completado con éxito", { shop });
        } catch (error) {
          logger.error("Error durante la transacción de redacción de datos", {
            shop,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
        break;

      case "SHOP_REDACT":
        logger.info("Iniciando eliminación completa de datos", { shop });

        const { shop_domain } = payload;
        if (!shop_domain) {
          logger.warn("Payload de SHOP_REDACT no contiene shop_domain", { shop });
          return new Response(null, { status: 200 });
        }

        try {
          await db.$transaction(async (prisma) => {
            const shopRecord = await prisma.shop.findUnique({
              where: { shop_domain },
            });

            if (!shopRecord) {
              logger.info("La tienda no fue encontrada", { shop_domain });
              return;
            }

            // --- Eliminado: Lógica de Twilio (ya no se usa en la app) ---
            // Si en el futuro se usan otros proveedores, agregar aquí la lógica correspondiente.

            const deletedSessions = await prisma.session.deleteMany({
              where: { shop: shop_domain },
            });
            logger.info("Sesiones eliminadas", {
              shop_domain,
              count: deletedSessions.count,
            });

            await prisma.shop.delete({ where: { shop_domain } });
            logger.info("Registro de la tienda eliminado", { shop_domain });
          });

          logger.info("Proceso de eliminación completa finalizado", {
            shop_domain,
          });
        } catch (error) {
          logger.error("Error durante la eliminación de la tienda", {
            shop_domain,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
        break;

      // =================================================================
      // OTROS WEBHOOKS
      // =================================================================
      // NOTA: APP_UNINSTALLED y APP_SCOPES_UPDATE están manejados en archivos separados:
      // - app/routes/webhooks.app.uninstalled.tsx
      // - app/routes/webhooks.app.scopes_update.tsx
      // Esto evita duplicación y sigue las mejores prácticas de Shopify 2025

      default:
        logger.warn("Webhook no manejado", { topic, shop });
        break;
    }

    // Responde siempre con un 200 OK para que Shopify sepa que recibiste el webhook.
    return new Response(null, { status: 200 });
  } catch (error) {
    // Manejo de errores de parsing JSON y otros errores de autenticación
    logger.error("Error en webhook", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Shopify requiere que siempre devolvamos 200 OK, incluso en errores
    return new Response(null, { status: 200 });
  }
};
