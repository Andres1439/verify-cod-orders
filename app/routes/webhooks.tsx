/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/webhooks.tsx

import type { ActionFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { withRawBody } from "../utils/webhook-middleware.server";
import db from "../db.server"; // Tu cliente de Prisma conectado a Supabase
import crypto from "crypto";
import { sendCustomerDataReportEmail } from "../services/email.server";
import { logger } from "../utils/logger.server";

export const action = async (args: ActionFunctionArgs) => {
  return withRawBody(args, async ({ request, rawBody }) => {
    try {
      // Información crítica del webhook
      const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
      const shopifyTopic = request.headers.get('X-Shopify-Topic');
      const shopifyShop = request.headers.get('X-Shopify-Shop-Domain');
      
      logger.info("🔍 Webhook GDPR recibido", {
        topic: shopifyTopic,
        shop: shopifyShop,
        hasHmac: !!hmacHeader,
        bodySize: rawBody.length,
        contentType: request.headers.get('Content-Type')
      });

      // VALIDACIÓN HMAC MANUAL PARA WEBHOOKS GDPR
      // Esto es crítico para pasar el test automatizado de Shopify
      if (!hmacHeader) {
        logger.error("❌ HMAC header faltante");
        return new Response(JSON.stringify({ error: "HMAC header missing" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validar HMAC manualmente usando el raw body
      const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;
      if (!webhookSecret) {
        logger.error("❌ SHOPIFY_WEBHOOK_SECRET no configurado");
        return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Calcular HMAC esperado
      const calculatedHmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('base64');

      // Comparación segura de HMAC
      const isValidHmac = crypto.timingSafeEqual(
        Buffer.from(calculatedHmac),
        Buffer.from(hmacHeader)
      );

      if (!isValidHmac) {
        logger.error("❌ HMAC validation failed", {
          expected: calculatedHmac.substring(0, 10) + '...',
          received: hmacHeader.substring(0, 10) + '...',
          topic: shopifyTopic
        });
        return new Response(JSON.stringify({ error: "HMAC validation failed" }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      logger.info("✅ HMAC validation successful", { topic: shopifyTopic });

      // Ahora usar authenticate.webhook con la request que ya tiene HMAC válido
      const { topic, shop, payload, admin } = await authenticate.webhook(request);

      logger.info("✅ Webhook autenticado exitosamente", {
        topic,
        shop,
        timestamp: new Date().toISOString()
      });

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
              include: {
                tickets: true,
                order_confirmations: true,
                vonage_configuration: true,
                chatbot_configuration: true,
                whatsAppNumbers: true
              }
            });

            if (!shopRecord) {
              logger.info("La tienda no fue encontrada", { shop_domain });
              return;
            }

            logger.info("Tienda encontrada para SHOP_REDACT, iniciando eliminación completa", { 
              shop_domain, 
              shopId: shopRecord.id,
              ticketsCount: shopRecord.tickets.length,
              ordersCount: shopRecord.order_confirmations.length,
              hasVonageConfig: !!shopRecord.vonage_configuration,
              hasChatbotConfig: !!shopRecord.chatbot_configuration,
              whatsAppNumbersCount: shopRecord.whatsAppNumbers.length
            });

            // 1. PRIMERO: Liberar números de WhatsApp (no tienen onDelete: Cascade)
            const updatedWhatsAppNumbers = await prisma.whatsAppNumber.updateMany({
              where: { default_shop_id: shopRecord.id },
              data: {
                default_shop_id: null,
                assignment_status: "AVAILABLE",
                assigned_at: null,
              },
            });
            logger.info("Números de WhatsApp liberados en SHOP_REDACT", {
              shop_domain,
              count: updatedWhatsAppNumbers.count,
            });

            // 2. Eliminar sesiones (no tienen relación con shop_id)
            const deletedSessions = await prisma.session.deleteMany({
              where: { shop: shop_domain },
            });
            logger.info("Sesiones eliminadas en SHOP_REDACT", {
              shop_domain,
              count: deletedSessions.count,
            });

            // 3. ELIMINAR LA TIENDA - onDelete: Cascade eliminará automáticamente:
            // - tickets (onDelete: Cascade)
            // - order_confirmations (onDelete: Cascade) 
            // - vonage_configuration (onDelete: Cascade)
            // - chatbot_configuration (onDelete: Cascade)
            await prisma.shop.delete({ where: { shop_domain } });
            
            logger.info("✅ SHOP_REDACT COMPLETADO", { 
              shop_domain,
              message: "Tienda y todos los datos relacionados eliminados por onDelete: Cascade",
              eliminatedAutomatically: [
                "tickets",
                "order_confirmations", 
                "vonage_configuration",
                "chatbot_configuration"
              ]
            });
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Detectar si es un error de autenticación HMAC
    const isAuthError = errorMessage.includes('HMAC') || 
                       errorMessage.includes('authentication') ||
                       errorMessage.includes('signature') ||
                       errorMessage.includes('webhook validation') ||
                       errorMessage.includes('Unauthorized');
    
    // Log detallado del error para debugging
    const url = new URL(request.url);
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    const shopifyTopic = request.headers.get('X-Shopify-Topic');
    const shopifyShop = request.headers.get('X-Shopify-Shop-Domain');
    
    logger.error("Error en webhook", {
      error: errorMessage,
      stack: errorStack,
      isAuthError,
      url: url.pathname,
      method: request.method,
      hasHmac: !!hmacHeader,
      hmacLength: hmacHeader?.length || 0,
      shopifyTopic,
      shopifyShop,
      userAgent: request.headers.get('User-Agent'),
      contentType: request.headers.get('Content-Type'),
      timestamp: new Date().toISOString()
    });
    
    // Devuelve 401 para errores de autenticación, 500 para otros errores
    const statusCode = isAuthError ? 401 : 500;
    logger.error(`Respondiendo con HTTP ${statusCode}`, { 
      reason: isAuthError ? 'HMAC validation failed' : 'Internal server error',
      shopifyShop,
      shopifyTopic
    });
    
    return new Response(JSON.stringify({ 
      error: isAuthError ? 'Webhook authentication failed' : 'Internal server error',
      timestamp: new Date().toISOString(),
      debug: {
        hasHmac: !!hmacHeader,
        topic: shopifyTopic,
        shop: shopifyShop
      }
    }), { 
      status: statusCode,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  }); // Cierre de withRawBody
};
