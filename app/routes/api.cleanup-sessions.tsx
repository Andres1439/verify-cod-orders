// app/routes/api.cleanup-sessions.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const now = new Date();
    
    // Expirar sesiones antiguas (24+ horas)
    const expiredSessions = await db.whatsAppSession.updateMany({
      where: {
        status: 'ACTIVE',
        expires_at: { lt: now }
      },
      data: { status: 'EXPIRED' }
    });

    // Eliminar sesiones muy antiguas (7+ días)
    const deletedSessions = await db.whatsAppSession.deleteMany({
      where: {
        status: { in: ['EXPIRED', 'CLOSED'] },
        created_at: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    console.log(`[CLEANUP] Sesiones expiradas: ${expiredSessions.count}, eliminadas: ${deletedSessions.count}`);

    return json({ 
      success: true, 
      expired: expiredSessions.count,
      deleted: deletedSessions.count,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error("Error en limpieza de sesiones:", error);
    return json({ 
      success: false, 
      error: "Error en limpieza",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, { status: 500 });
  }
}