// app/routes/api.vonage-calls.tsx - VERSIÓN SIMPLIFICADA QUE FUNCIONA
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { formatPhoneNumber } from "../utils/common-utils";
import db from "../db.server";
import crypto from "crypto";

// 🔐 Configuración de Vonage
const VONAGE_CONFIG = {
  APPLICATION_ID: process.env.VONAGE_APPLICATION_ID!,
  PRIVATE_KEY: process.env.VONAGE_PRIVATE_KEY!,
  FROM_NUMBER: process.env.VONAGE_FROM_NUMBER || "12068655412",
  API_URL: "https://api.nexmo.com/v1/calls"
};

// 🛡️ Generar JWT para Vonage - VERSIÓN SIMPLIFICADA Y PROBADA
function generateVonageJWT(): string {
  try {
    // Validar variables de entorno
    if (!VONAGE_CONFIG.APPLICATION_ID) {
      throw new Error('VONAGE_APPLICATION_ID no está configurado');
    }
    
    if (!VONAGE_CONFIG.PRIVATE_KEY) {
      throw new Error('VONAGE_PRIVATE_KEY no está configurado');
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Header del JWT
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    
    // Payload del JWT con los claims requeridos por Vonage
    const payload = {
      iat: now,
      exp: now + 900, // 15 minutos
      application_id: VONAGE_CONFIG.APPLICATION_ID,
      jti: crypto.randomUUID() // Usar crypto.randomUUID() en lugar de randomBytes
    };
    
    // Función helper para codificar en base64url
    function base64UrlEncode(data: string): string {
      return Buffer.from(data)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    }
    
    // Crear el JWT
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    
    // Limpiar la private key de manera simple
    let privateKey = VONAGE_CONFIG.PRIVATE_KEY;
    
    // Reemplazar \n escapados con saltos de línea reales
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // Trim y limpiar
    privateKey = privateKey.trim();
    
    // Validar formato básico
    if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      throw new Error('Private key debe empezar con -----BEGIN PRIVATE KEY-----');
    }
    
    if (!privateKey.endsWith('-----END PRIVATE KEY-----')) {
      throw new Error('Private key debe terminar con -----END PRIVATE KEY-----');
    }
    
    // Firmar
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(dataToSign);
    const signature = sign.sign(privateKey, 'base64');
    
    // Convertir a base64url
    const base64UrlSignature = signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const jwt = `${dataToSign}.${base64UrlSignature}`;
    
    console.log('✅ JWT generado exitosamente para Vonage');
    return jwt;
    
  } catch (error) {
    console.error('❌ Error generando JWT:', {
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error; // Re-throw para que se maneje arriba
  }
}

// 📞 POST - Iniciar llamada de verificación
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { orderId } = await request.json();
    
    if (!orderId) {
      return json({ error: 'Order ID is required' }, { status: 400 });
    }
    
    console.log(`🔄 Procesando pedido: ${orderId}`);
    
    // 1. Obtener datos del pedido
    const order = await db.orderConfirmation.findFirst({
      where: {
        id: orderId,
        status: 'PENDING_CALL'
      },
      include: {
        shop: true
      }
    });
    
    if (!order) {
      console.log(`❌ Pedido no encontrado: ${orderId}`);
      return json({ error: 'Order not found or not pending call' }, { status: 404 });
    }
    
    console.log(`✅ Pedido encontrado: ${order.internal_order_number}`);
    
    // 2. Parsear datos del pedido
    const shippingAddress = typeof order.shipping_address === "string"
      ? JSON.parse(order.shipping_address || "{}")
      : order.shipping_address || {};
    const country = shippingAddress.country || 'PE';
    
    // 3. Formatear número de teléfono
    const formattedPhone = formatPhoneNumber(order.customer_phone, country);
    console.log(`📞 Número formateado: ${formattedPhone}`);
    
    // 4. Generar JWT
    console.log('🔐 Generando JWT...');
    const jwt = generateVonageJWT();
    
    // 5. Configurar llamada para Vonage
    const callPayload = {
      to: [{
        type: "phone",
        number: formattedPhone
      }],
      from: {
        type: "phone",
        number: VONAGE_CONFIG.FROM_NUMBER
      },
      answer_url: [`${process.env.APP_URL}/api/vonage-answer?orderId=${orderId}`],
      event_url: [`${process.env.APP_URL}/api/vonage-events`],
      machine_detection: "continue"
    };
    
    console.log('📡 Enviando llamada a Vonage API...');
    console.log('Payload:', JSON.stringify(callPayload, null, 2));
    
    // 6. Realizar llamada a Vonage
    const response = await fetch(VONAGE_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(callPayload)
    });
    
    const responseText = await response.text();
    console.log(`📊 Respuesta de Vonage (${response.status}):`, responseText);
    
    if (!response.ok) {
      console.error('❌ Error de Vonage API:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
      return json({ 
        error: 'Failed to initiate call',
        details: `Vonage API error: ${response.status} - ${responseText}`
      }, { status: 500 });
    }
    
    let callData;
    try {
      callData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Error parseando respuesta de Vonage:', parseError);
      return json({ 
        error: 'Invalid response from Vonage API',
        details: responseText
      }, { status: 500 });
    }
    
    console.log('✅ Llamada iniciada exitosamente:', callData);
    
    // 7. Actualizar base de datos
    await db.orderConfirmation.update({
      where: { id: orderId },
      data: {
        vonage_call_uuid: callData.uuid,
        call_status: 'PENDING',
        call_started_at: new Date(),
        updated_at: new Date()
      }
    });
    
    console.log('✅ Base de datos actualizada');
    
    return json({
      success: true,
      call_uuid: callData.uuid,
      order_id: orderId,
      phone: formattedPhone,
      status: callData.status,
      conversation_uuid: callData.conversation_uuid
    });
    
  } catch (error) {
    console.error('❌ Error en la iniciación de llamada:', {
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 📋 GET - Obtener pedidos pendientes
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    console.log(`📋 Buscando pedidos pendientes (límite: ${limit})`);
    
    const pendingOrders = await db.orderConfirmation.findMany({
      where: {
        status: 'PENDING_CALL'
      },
      include: {
        shop: {
          select: {
            shop_domain: true
          }
        }
      },
      orderBy: {
        created_at: 'asc'
      },
      take: limit
    });
    
    console.log(`📊 Encontrados ${pendingOrders.length} pedidos pendientes`);
    
    // Para N8N, devolver los items directamente
    const orders = pendingOrders.map(order => ({
      id: order.id,
      customer_phone: order.customer_phone,
      shop_domain: order.shop?.shop_domain,
      order_total: order.order_total,
      internal_order_number: order.internal_order_number,
      created_at: order.created_at
    }));

    return json(orders);
    
  } catch (error) {
    console.error('❌ Error obteniendo pedidos pendientes:', error);
    return json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}