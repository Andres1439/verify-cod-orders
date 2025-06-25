// app/routes/webhooks.tsx

import type { ActionFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server"; // Tu cliente de Prisma conectado a Supabase
import { sendCustomerDataReportEmail } from "../services/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // `authenticate.webhook` valida la petición y devuelve el tópico, tienda y payload
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  // Esta línea es útil para ver en tu consola cada webhook que llega
  console.log(`-> Webhook recibido: ${topic} para la tienda ${shop}`);

  switch (topic) {
    // =================================================================
    // WEBHOOKS DE CUMPLIMIENTO OBLIGATORIOS
    // =================================================================
    case "CUSTOMERS_DATA_REQUEST":
      console.log(
        `Iniciando recopilación de datos de cliente para la tienda ${shop}`,
      );

      const { customer } = payload;

      if (!customer || (!customer.email && !customer.phone)) {
        console.warn(
          "Payload de CUSTOMERS_DATA_REQUEST no contiene email ni teléfono. No se puede proceder.",
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

        console.log(
          `Datos recopilados: ${JSON.stringify(customerDataReport, null, 2)}`,
        );

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

        // TODO: ACCIÓN REQUERIDA
        // Implementa aquí la lógica para enviar el `customerDataReport` por email al dueño de la tienda.
        // Necesitarás un servicio como Resend, SendGrid, etc.
        console.log(
          "✅ Proceso de recopilación completado. El siguiente paso es notificar al comerciante.",
        );
      } catch (error) {
        console.error(
          "❌ Error durante la recopilación de datos del cliente:",
          error,
        );
      }
      break;

    case "CUSTOMERS_REDACT":
      console.log(
        `Iniciando proceso de redacción de datos para la tienda ${shop}`,
      );

      const { customer: customerToRedact } = payload;

      if (
        !customerToRedact ||
        (!customerToRedact.email && !customerToRedact.phone)
      ) {
        console.warn(
          "Payload de CUSTOMERS_REDACT no contiene email o teléfono. No se puede proceder.",
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
          console.log(`- Tickets eliminados: ${deletedTickets.count}`);

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
          console.log(
            `- Confirmaciones de pedido anonimizadas: ${updatedOrders.count}`,
          );

          return { deletedTickets, updatedOrders };
        });

        console.log(
          "✅ Proceso de redacción completado con éxito.",
          transactionResult,
        );
      } catch (error) {
        console.error(
          "❌ Error durante la transacción de redacción de datos:",
          error,
        );
      }
      break;

    case "SHOP_REDACT":
      console.log(
        `Iniciando eliminación completa de datos para la tienda ${shop}`,
      );

      const { shop_domain } = payload;
      if (!shop_domain) {
        console.warn(
          "Payload de SHOP_REDACT no contiene shop_domain. No se puede proceder.",
        );
        return new Response(null, { status: 200 });
      }

      try {
        await db.$transaction(async (prisma) => {
          const shopRecord = await prisma.shop.findUnique({
            where: { shop_domain },
          });

          if (!shopRecord) {
            console.log(
              `La tienda ${shop_domain} no fue encontrada. No se requiere acción.`,
            );
            return;
          }

          await prisma.twilioNumber.updateMany({
            where: { shop_id: shopRecord.id },
            data: { shop_id: null, assigned_at: null, status: "AVAILABLE" },
          });
          console.log(
            `- Número de Twilio de la tienda ${shop_domain} devuelto al pool.`,
          );

          const deletedSessions = await prisma.session.deleteMany({
            where: { shop: shop_domain },
          });
          console.log(`- Sesiones eliminadas: ${deletedSessions.count}`);

          await prisma.shop.delete({ where: { shop_domain } });
          console.log(
            `- Registro de la tienda ${shop_domain} y datos asociados eliminados en cascada.`,
          );
        });

        console.log(
          `✅ Proceso de eliminación completa para ${shop_domain} finalizado.`,
        );
      } catch (error) {
        console.error(
          `❌ Error durante la eliminación de la tienda ${shop_domain}:`,
          error,
        );
      }
      break;

    // =================================================================
    // OTROS WEBHOOKS
    // =================================================================
    case "APP_UNINSTALLED":
      console.log("La app fue desinstalada. Limpiando sesión...");
      await db.session.deleteMany({ where: { shop } });
      break;

    case "APP_SCOPES_UPDATE":
      console.log("Los scopes han cambiado. Actualizando sesión...");
      const session = await db.session.findFirst({ where: { shop } });
      if (session) {
        await db.session.update({
          where: { id: session.id },
          data: { scope: payload.scopes.toString() },
        });
        console.log("✅ Scopes actualizados.");
      }
      break;

    default:
      console.warn(`Webhook ${topic} no manejado.`);
      break;
  }

  // Responde siempre con un 200 OK para que Shopify sepa que recibiste el webhook.
  return new Response(null, { status: 200 });
};
