import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    logger.info(`Webhook ${topic} recibido para ${shop}`);
    logger.info("🚨 INICIANDO ELIMINACIÓN COMPLETA DE DATOS DE LA TIENDA", { shop });

    // ✅ ELIMINACIÓN COMPLETA DE TODOS LOS DATOS DE LA TIENDA
    // Esto debe ser idéntico al webhook SHOP_REDACT para cumplir con Shopify
    try {
      await db.$transaction(async (prisma) => {
        // 1. Buscar el registro de la tienda
        const shopRecord = await prisma.shop.findUnique({
          where: { shop_domain: shop },
          include: {
            tickets: true,
            order_confirmations: true,
            vonage_configuration: true,
            chatbot_configuration: true,
            whatsAppNumbers: true
          }
        });

        if (!shopRecord) {
          logger.info("La tienda no fue encontrada en la BD", { shop });
          return;
        }

        logger.info("Tienda encontrada, iniciando eliminación completa", { 
          shop, 
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
        logger.info("Números de WhatsApp liberados", {
          shop,
          count: updatedWhatsAppNumbers.count,
        });

        // 2. Eliminar sesiones (no tienen relación con shop_id)
        const deletedSessions = await prisma.session.deleteMany({
          where: { shop: shop },
        });
        logger.info("Sesiones eliminadas", {
          shop,
          count: deletedSessions.count,
        });

        // 3. ELIMINAR LA TIENDA - onDelete: Cascade eliminará automáticamente:
        // - tickets (onDelete: Cascade)
        // - order_confirmations (onDelete: Cascade) 
        // - vonage_configuration (onDelete: Cascade)
        // - chatbot_configuration (onDelete: Cascade)
        await prisma.shop.delete({ 
          where: { shop_domain: shop } 
        });
        
        logger.info("✅ ELIMINACIÓN COMPLETA FINALIZADA", { 
          shop,
          message: "Tienda y todos los datos relacionados eliminados por onDelete: Cascade",
          eliminatedAutomatically: [
            "tickets",
            "order_confirmations", 
            "vonage_configuration",
            "chatbot_configuration"
          ]
        });
      });

      logger.info("🎉 ELIMINACIÓN COMPLETA FINALIZADA CON ÉXITO", { shop });
      
    } catch (transactionError) {
      logger.error("❌ Error durante la eliminación completa de la tienda", {
        shop,
        error: transactionError instanceof Error ? transactionError.message : "Unknown error",
        stack: transactionError instanceof Error ? transactionError.stack : undefined,
      });
    }

    // Shopify requiere que siempre devolvamos 200 OK
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ Error crítico en webhook de desinstalación", {
      shop: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Shopify requiere que siempre devolvamos 200 OK, incluso en errores
    return new Response(null, { status: 200 });
  }
};
