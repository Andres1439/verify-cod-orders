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
        });

        if (!shopRecord) {
          logger.info("La tienda no fue encontrada en la BD", { shop });
          return;
        }

        logger.info("Tienda encontrada, iniciando eliminación completa", { 
          shop, 
          shopId: shopRecord.id 
        });

        // 2. Eliminar todos los tickets de la tienda
        const deletedTickets = await prisma.ticket.deleteMany({
          where: { shop_id: shopRecord.id },
        });
        logger.info("Tickets eliminados", {
          shop,
          count: deletedTickets.count,
        });

        // 3. Eliminar todas las confirmaciones de órdenes
        const deletedOrders = await prisma.orderConfirmation.deleteMany({
          where: { shop_id: shopRecord.id },
        });
        logger.info("Confirmaciones de órdenes eliminadas", {
          shop,
          count: deletedOrders.count,
        });

        // 4. Eliminar configuración de Vonage
        const deletedVonageConfig = await prisma.vonageConfiguration.deleteMany({
          where: { shop_id: shopRecord.id },
        });
        logger.info("Configuración de Vonage eliminada", {
          shop,
          count: deletedVonageConfig.count,
        });

        // 5. Eliminar configuración de chatbot
        const deletedChatbotConfig = await prisma.chatbotConfiguration.deleteMany({
          where: { shop_id: shopRecord.id },
        });
        logger.info("Configuración de chatbot eliminada", {
          shop,
          count: deletedChatbotConfig.count,
        });

        // 6. Liberar números de WhatsApp asignados (cambiar a AVAILABLE)
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

        // 7. Eliminar todas las sesiones
        const deletedSessions = await prisma.session.deleteMany({
          where: { shop: shop },
        });
        logger.info("Sesiones eliminadas", {
          shop,
          count: deletedSessions.count,
        });

        // 7. FINALMENTE: Eliminar el registro de la tienda
        await prisma.shop.delete({ 
          where: { shop_domain: shop } 
        });
        logger.info("✅ Registro de la tienda eliminado completamente", { shop });
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
