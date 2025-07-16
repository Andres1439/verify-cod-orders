// app/routes/api.whatsapp-session.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { action, phone_number, session_id, customer_message, bot_response } = await request.json();

    switch (action) {
      case 'find':
        return await findSession(phone_number);
      
      case 'update':
        return await updateSession(session_id, customer_message, bot_response);
      
      default:
        return json({ success: false, error: "Acción no válida" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error en Session API:", error);
    return json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// 🔍 BUSCAR SESIÓN ACTIVA - SOLO BUSCAR, NO ACTUALIZAR
async function findSession(phoneNumber: string) {
  const session = await db.whatsAppSession.findFirst({
    where: {
      phone_number: phoneNumber,
      status: 'ACTIVE',
      expires_at: { gt: new Date() }
    },
    include: {
      shop: { include: { chatbot_configuration: true } }
    },
    orderBy: { last_message_at: 'desc' }
  });

  if (!session) {
    return json({ success: true, session: null });
  }

  // ✅ SOLO RETORNA DATOS, NO ACTUALIZA AQUÍ
  return json({
    success: true,
    session: {
      session_id: session.session_id,
      shop_id: session.shop_id,
      shop_domain: session.shop.shop_domain,
      store_name: session.shop.chatbot_configuration?.bot_name || 
                  session.shop.shop_domain.replace('.myshopify.com', ''),
      detection_method: session.detection_method,
      confidence: session.confidence,
      message_count: session.message_count,
      conversation_context: session.conversation_context,
      chatbot_config: session.shop.chatbot_configuration
    }
  });
}

// 🔄 ACTUALIZAR SESIÓN - AQUÍ SÍ SE ACTUALIZA EL CONTADOR
async function updateSession(sessionId: string, customerMessage: string, botResponse: string) {
  const currentSession = await db.whatsAppSession.findUnique({
    where: { session_id: sessionId }
  });

  if (!currentSession) {
    return json({ success: false, error: "Sesión no encontrada" }, { status: 404 });
  }

  // Actualizar contexto conversacional
  const currentContext = currentSession.conversation_context as any || {};
  const recentMessages = currentContext.recent_messages || [];

  if (customerMessage && botResponse) {
    recentMessages.push({
      timestamp: new Date().toISOString(),
      customer: customerMessage,
      bot: botResponse
    });

    // Mantener solo los últimos 5 mensajes
    if (recentMessages.length > 5) {
      recentMessages.splice(0, recentMessages.length - 5);
    }
  }

  // ✅ ACTUALIZAR CONTADOR AQUÍ
  await db.whatsAppSession.update({
    where: { session_id: sessionId },
    data: {
      conversation_context: {
        ...currentContext,
        recent_messages: recentMessages,
        last_updated: new Date().toISOString()
      },
      last_message_at: new Date(),
      message_count: { increment: 1 }, // ← INCREMENTAR SOLO AQUÍ
      last_bot_response: botResponse
    }
  });

  return json({ success: true });
}