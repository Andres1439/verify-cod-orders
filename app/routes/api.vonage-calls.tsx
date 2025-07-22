// app/routes/api.vonage-calls.tsx
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

// 🛡️ Generar JWT para Vonage
function generateVonageJWT(): string {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    
    const payload = {
      iat: now,
      exp: now + 900, // 15 minutos
      application_id: VONAGE_CONFIG.APPLICATION_ID,
      jti: crypto.randomBytes(16).toString('hex')
    };
    
    function base64UrlEncode(data: string): string {
      return Buffer.from(data)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    }
    
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(dataToSign);
    const signature = sign.sign(VONAGE_CONFIG.PRIVATE_KEY, 'base64');
    
    const base64UrlSignature = signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return `${dataToSign}.${base64UrlSignature}`;
  } catch (error) {
    console.error('❌ Error generando JWT:', error);
    throw new Error('Failed to generate Vonage JWT');
  }
}

// 🎵 Generar NCCO para la llamada
function generateNCCO(orderData: any, callUuid: string): any[] {
  const customerName = orderData.customer_name || 'Cliente';
  const orderTotal = parseFloat(orderData.order_total || '0').toFixed(2);
  const currency = orderData.shop_currency || 'PEN';
  
  let talkText = 'Hola, te llamamos para confirmar tu pedido. Presiona 1 para confirmar, o 2 para cancelar.';
  
  if (parseFloat(orderTotal) > 0) {
    talkText = `Hola ${customerName}, te llamamos para confirmar tu pedido por ${orderTotal} ${currency}. Presiona 1 para confirmar, o 2 para cancelar.`;
  }
  
  return [
    {
      action: "talk",
      text: talkText,
      language: "es-ES"
    },
    {
      action: "input",
      eventUrl: [`${process.env.APP_URL}/api/vonage-dtmf?call_uuid=${callUuid}`],
      timeOut: 15,
      maxDigits: 1,
      submitOnHash: false
    }
  ];
}

// 📞 POST - Iniciar llamada de verificación
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { orderId } = await request.json();
    
    if (!orderId) {
      return json({ error: 'Order ID is required' }, { status: 400 });
    }
    
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
      return json({ error: 'Order not found or not pending call' }, { status: 404 });
    }
    
    // 2. Parsear datos del pedido
    const shippingAddress = typeof order.shipping_address === "string"
      ? JSON.parse(order.shipping_address || "{}")
      : order.shipping_address || {};
    const country = shippingAddress.country || 'PE';
    
    // 3. Formatear número de teléfono
    const formattedPhone = formatPhoneNumber(order.customer_phone, country);
    
    // 4. Generar JWT
    const jwt = generateVonageJWT();
    
    // 5. Configurar llamada
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
    
    // 6. Realizar llamada a Vonage
    const response = await fetch(VONAGE_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Vonage API Error:', errorText);
      return json({ error: 'Failed to initiate call' }, { status: 500 });
    }
    
    const callData = await response.json();
    
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
    
    console.log('✅ Call initiated successfully:', {
      orderId,
      callUuid: callData.uuid,
      phone: formattedPhone
    });
    
    return json({
      success: true,
      call_uuid: callData.uuid,
      order_id: orderId,
      phone: formattedPhone,
      status: callData.status
    });
    
  } catch (error) {
    console.error('❌ Error in call initiation:', error);
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
    
    // Para N8N, es mejor devolver los items directamente sin wrapper
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
    console.error('❌ Error fetching pending orders:', error);
    return json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}