import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    logger.info(`Webhook ${topic} recibido para ${shop}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      const deletedSessions = await db.session.deleteMany({ where: { shop } });
      logger.info(`Sesiones eliminadas para ${shop}`, { 
        count: deletedSessions.count,
        sessionId: session.id 
      });
    } else {
      logger.info(`No se encontraron sesiones para eliminar en ${shop}`);
    }

    // Shopify requiere que siempre devolvamos 200 OK
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("Error en webhook de desinstalación", {
      shop: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Shopify requiere que siempre devolvamos 200 OK, incluso en errores
    return new Response(null, { status: 200 });
  }
};
