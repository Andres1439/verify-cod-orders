// app/routes/api.detect-store.tsx - VERSIÓN FINAL
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { phone_number, message, business_account_id } = await request.json();
    
    console.log(`[DETECT-STORE] 📱 Phone: ${phone_number}`);
    console.log(`[DETECT-STORE] 💬 Message: ${message}`);
    console.log(`[DETECT-STORE] 🆔 Business ID: ${business_account_id}`);
    
    // 🔍 PASO 1: VERIFICAR SI YA EXISTE SESIÓN ACTIVA
    const existingSession = await findActiveSession(phone_number);
    if (existingSession) {
      console.log(`[DETECT-STORE] ✅ Sesión encontrada: ${existingSession.session_id}`);
      
      // Incrementar contador de mensajes
      await db.whatsAppSession.update({
        where: { session_id: existingSession.session_id },
        data: { 
          message_count: { increment: 1 },
          last_message_at: new Date()
        }
      });
      
      return json({ 
        ...existingSession,
        action: 'session_reused',
        message: 'Sesión existente reutilizada'
      });
    }

    console.log(`[DETECT-STORE] 🆕 Creando nueva sesión...`);

    // 🎯 PASO 2: DETECTAR TIENDA Y CREAR NUEVA SESIÓN
    
    // 1️⃣ Detectar por código start_
    const startResult = await detectByStartCode(message);
    if (startResult) {
      const sessionId = await createSession(phone_number, startResult, business_account_id, message, 'start_code');
      console.log(`[DETECT-STORE] ✅ Detección START: ${sessionId}`);
      return json({ ...startResult, session_id: sessionId, action: 'new_session' });
    }

    // 2️⃣ Detectar por tienda asignada
    const assignedResult = await detectByAssignedShop(business_account_id);
    if (assignedResult) {
      const sessionId = await createSession(phone_number, assignedResult, business_account_id, message, 'assigned_shop');
      console.log(`[DETECT-STORE] ✅ Detección ASIGNADA: ${sessionId}`);
      return json({ ...assignedResult, session_id: sessionId, action: 'new_session' });
    }

    // 3️⃣ Tienda por defecto
    const defaultResult = await getDefaultStore();
    const sessionId = await createSession(phone_number, defaultResult, business_account_id, message, 'default');
    console.log(`[DETECT-STORE] ✅ Detección DEFAULT: ${sessionId}`);
    return json({ ...defaultResult, session_id: sessionId, action: 'new_session' });

  } catch (error) {
    console.error("[DETECT-STORE] ❌ Error:", error);
    return json({ error: "Error interno" }, { status: 500 });
  }
}

// 🔍 BUSCAR SESIÓN ACTIVA EXISTENTE
async function findActiveSession(phoneNumber: string) {
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

  if (!session) return null;

  return {
    session_id: session.session_id,
    shop_id: session.shop_id,
    shop_domain: session.shop.shop_domain,
    store_name: session.shop.chatbot_configuration?.bot_name || 
                session.shop.shop_domain.replace('.myshopify.com', ''),
    confidence: session.confidence,
    method: session.detection_method,
    chatbot_config: session.shop.chatbot_configuration,
    whatsapp_number_id: session.whatsapp_number_id,
    message_count: session.message_count
  };
}

// 🎯 DETECTAR POR CÓDIGO START
async function detectByStartCode(message: string) {
  const startMatch = message.toLowerCase().match(/start[_\s]+([a-zA-Z0-9\-]+)/);
  if (!startMatch) return null;
  
  const storeName = startMatch[1];
  const shopDomain = `${storeName}.myshopify.com`;
  
  console.log(`[DETECT-STORE] 🔍 Buscando: ${shopDomain}`);
  
  const shop = await db.shop.findUnique({
    where: { shop_domain: shopDomain },
    include: { 
      chatbot_configuration: true,
      whatsAppNumbers: { where: { status: 'ACTIVE' } }
    }
  });

  if (!shop) {
    console.log(`[DETECT-STORE] ❌ No encontrada: ${shopDomain}`);
    return null;
  }

  console.log(`[DETECT-STORE] ✅ Encontrada: ${shop.shop_domain}`);

  return {
    shop_id: shop.id,
    shop_domain: shop.shop_domain,
    store_name: shop.chatbot_configuration?.bot_name || storeName,
    confidence: 'high',
    method: 'start_code',
    chatbot_config: shop.chatbot_configuration,
    whatsapp_number_id: shop.whatsAppNumbers[0]?.id
  };
}

// 🏪 DETECTAR POR TIENDA ASIGNADA
async function detectByAssignedShop(businessAccountId?: string) {
  if (!businessAccountId) return null;

  const whatsappNumber = await db.whatsAppNumber.findFirst({
    where: {
      business_account_id: businessAccountId,
      status: 'ACTIVE',
      default_shop_id: { not: null }
    },
    include: {
      shop: { include: { chatbot_configuration: true } }
    }
  });

  if (!whatsappNumber?.shop) return null;

  return {
    shop_id: whatsappNumber.shop.id,
    shop_domain: whatsappNumber.shop.shop_domain,
    store_name: whatsappNumber.shop.chatbot_configuration?.bot_name || 
                whatsappNumber.shop.shop_domain.replace('.myshopify.com', ''),
    confidence: 'high',
    method: 'assigned_shop',
    chatbot_config: whatsappNumber.shop.chatbot_configuration,
    whatsapp_number_id: whatsappNumber.id
  };
}

// 🏪 TIENDA POR DEFECTO
async function getDefaultStore() {
  const shop = await db.shop.findFirst({
    where: { subscription_plan: { not: 'FREE' } },
    include: { 
      chatbot_configuration: true,
      whatsAppNumbers: { where: { status: 'ACTIVE' } }
    },
    orderBy: { created_at: 'asc' }
  });

  if (!shop) throw new Error("No hay tiendas disponibles");

  return {
    shop_id: shop.id,
    shop_domain: shop.shop_domain,
    store_name: shop.chatbot_configuration?.bot_name || 
                shop.shop_domain.replace('.myshopify.com', ''),
    confidence: 'low',
    method: 'default',
    chatbot_config: shop.chatbot_configuration,
    whatsapp_number_id: shop.whatsAppNumbers[0]?.id
  };
}

// 💾 CREAR SESIÓN
async function createSession(phoneNumber: string, storeResult: any, businessAccountId: string | undefined, message: string, method: string) {
  let whatsappNumberId = storeResult.whatsapp_number_id;
  
  if (!whatsappNumberId) {
    const number = await db.whatsAppNumber.findFirst({
      where: { default_shop_id: storeResult.shop_id, status: 'ACTIVE' }
    });
    whatsappNumberId = number?.id;
  }

  if (!whatsappNumberId) {
    throw new Error("No se encontró número WhatsApp");
  }

  // 🆔 GENERAR SESSION ID
  const sessionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[CREATE-SESSION] 🆔 Session ID: ${sessionId}`);
  console.log(`[CREATE-SESSION] 📱 Phone: ${phoneNumber}`);
  console.log(`[CREATE-SESSION] 🏪 Shop: ${storeResult.shop_domain}`);
  
  try {
    // ✅ CREAR NUEVA SESIÓN
    const newSession = await db.whatsAppSession.create({
      data: {
        session_id: sessionId,
        phone_number: phoneNumber,
        whatsapp_number_id: whatsappNumberId,
        shop_id: storeResult.shop_id,
        detection_method: method,
        confidence: storeResult.confidence,
        conversation_context: {
          first_message: message,
          session_start: new Date().toISOString()
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
        message_count: 1,
        status: 'ACTIVE',
        last_message_at: new Date()
      }
    });

    console.log(`[CREATE-SESSION] ✅ Guardado en BD: ${newSession.session_id}`);
    return sessionId;

  } catch (dbError) {
    console.error(`[CREATE-SESSION] ❌ Error BD:`, dbError);
    throw dbError;
  }
}