import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    
    logger.info(`Webhook ${topic} recibido para ${shop}`);

    const current = payload.current as string[];
    
    if (session) {
      const updatedSession = await db.session.update({   
        where: {
          id: session.id
        },
        data: {
          scope: current.toString(),
        },
      });
      
      logger.info(`Scopes actualizados para ${shop}`, { 
        oldScope: session.scope,
        newScope: current.toString(),
        sessionId: session.id 
      });
    } else {
      logger.warn(`No se encontró sesión para actualizar scopes en ${shop}`);
    }

    // Shopify requiere que siempre devolvamos 200 OK
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("Error en webhook de actualización de scopes", {
      shop: "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Shopify requiere que siempre devolvamos 200 OK, incluso en errores
    return new Response(null, { status: 200 });
  }
};
