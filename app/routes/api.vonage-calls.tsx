// app/routes/api.vonage-calls.tsx - VERSIÓN COMPLETA ACTUALIZADA
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { formatPhoneNumber } from "../utils/common-utils";
import db from "../db.server";
import crypto from "crypto";
import { logger } from "../utils/logger.server";

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
    
    logger.info('JWT generado exitosamente para Vonage');
    return jwt;
    
  } catch (error) {
    logger.error('Error generando JWT', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
    
    logger.info(`Procesando pedido: ${orderId}`);
    
    // 1. Obtener datos del pedido
    const order = await db.orderConfirmation.findFirst({
      where: {
        id: orderId,
        status: 'PENDING_CALL',
        // NUEVO: Excluir órdenes que ya fallaron previamente
        call_status: {
          notIn: ['NO_ANSWER', 'FAILED']
        }
      },
      include: {
        shop: true
      }
    });
    
    if (!order) {
      logger.warn(`Pedido no encontrado o ya procesado: ${orderId}`);
      return json({ 
        error: 'Order not found, not pending call, or already failed',
        details: 'La orden no existe, no está pendiente de llamada, o ya falló previamente'
      }, { status: 404 });
    }
    
    logger.info(`Pedido encontrado: ${order.internal_order_number}`);
    
    // 2. Verificar que no sea muy antiguo (máximo 24 horas)
    const hoursOld = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
    
    if (hoursOld > 24) {
      logger.info(`Orden ${order.internal_order_number} muy antigua (${hoursOld.toFixed(1)}h), marcando como expirada`);
      
      // Marcar como expirada
      await db.orderConfirmation.update({
        where: { id: orderId },
        data: { 
          status: 'EXPIRED',
          call_status: 'FAILED',
          updated_at: new Date()
        }
      });
      
      return json({ 
        error: 'Order too old',
        details: `La orden tiene ${hoursOld.toFixed(1)} horas de antigüedad y ha expirado`
      }, { status: 410 });
    }
    
    // 3. Parsear datos del pedido
    const shippingAddress = typeof order.shipping_address === "string"
      ? JSON.parse(order.shipping_address || "{}")
      : order.shipping_address || {};
    const country = shippingAddress.country || 'PE';
    
    // 4. Formatear número de teléfono
    const formattedPhone = formatPhoneNumber(order.customer_phone, country);
    logger.info(`Número formateado: ${formattedPhone}`);
    
    // 5. Generar JWT
    const jwt = generateVonageJWT();
    
    // 6. Configurar llamada para Vonage
    const callPayload = {
      to: [{
        type: "phone",
        number: formattedPhone
      }],
      from: {
        type: "phone",
        number: VONAGE_CONFIG.FROM_NUMBER
      },
      answer_url: [`${process.env.APP_URL?.replace(/\/$/, '')}/api/vonage-answer?orderId=${orderId}`],
      event_url: [`${process.env.APP_URL?.replace(/\/$/, '')}/api/vonage-events`],
      fallback_url: [`${process.env.APP_URL?.replace(/\/$/, '')}/api/vonage-answer?orderId=${orderId}&fallback=true`],
      // machine_detection: "hangup", // Desactivar completamente machine detection
      length_timer: 300, // 5 minutos máximo
      ringing_timer: 30 // 30 segundos de timbre
    };
    
    // Validar URLs antes de enviar
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    logger.info(`Base URL: ${baseUrl}`);
    
    // Verificar que no hay doble slash en las URLs
    callPayload.answer_url.forEach(url => {
      if (url.includes('//api/')) {
        logger.warn(`URL con doble slash detectada: ${url}`);
      }
    });
    callPayload.event_url.forEach(url => {
      if (url.includes('//api/')) {
        logger.warn(`URL con doble slash detectada: ${url}`);
      }
    });
    
    // 7. Realizar llamada a Vonage
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
    logger.info(`Respuesta de Vonage (${response.status}): ${responseText}`);
    
    if (!response.ok) {
      logger.error(`Error de Vonage API: ${response.status} - ${responseText}`);
      
      // Verificar si es un número inválido
      const isInvalidNumber = responseText.includes('invalid') || 
                              responseText.includes('unallocated') ||
                              responseText.includes('not found');
      
      if (isInvalidNumber) {
        // Marcar inmediatamente como NO_ANSWER si es número inválido
        await db.orderConfirmation.update({
          where: { id: orderId },
          data: {
            call_status: 'NO_ANSWER',
            status: 'NO_ANSWER',
            updated_at: new Date(),
            last_event_at: new Date()
          }
        });
        
        logger.info(`Número inválido detectado para orden ${orderId}, marcado como NO_ANSWER`);
      }
      
      return json({ 
        error: 'Failed to initiate call',
        details: `Vonage API error: ${response.status} - ${responseText}`,
        is_invalid_number: isInvalidNumber
      }, { status: 500 });
    }
    
    let callData;
    try {
      callData = JSON.parse(responseText);
    } catch (parseError) {
      logger.error(`Error parseando respuesta de Vonage: ${parseError}`);
      return json({ 
        error: 'Invalid response from Vonage API',
        details: responseText
      }, { status: 500 });
    }
    
    logger.info(`Llamada iniciada exitosamente`, { callUuid: callData.uuid });
    
    // 8. Actualizar base de datos
    await db.orderConfirmation.update({
      where: { id: orderId },
      data: {
        vonage_call_uuid: callData.uuid,
        call_status: 'PENDING',
        call_started_at: new Date(),
        updated_at: new Date()
      }
    });
    
    logger.info(`Base de datos actualizada para orden ${orderId}`);
    
    return json({
      success: true,
      call_uuid: callData.uuid,
      order_id: orderId,
      phone: formattedPhone,
      status: callData.status,
      conversation_uuid: callData.conversation_uuid
    });
    
  } catch (error) {
    logger.error('Error interno en vonage-calls', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 📋 GET - Obtener pedidos pendientes (ACTUALIZADO CON FILTROS)
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    logger.info(`Obteniendo pedidos pendientes (límite: ${limit})`);
    
    const pendingOrders = await db.orderConfirmation.findMany({
      where: {
        // SOLO pedidos que realmente están pendientes
        status: 'PENDING_CALL',
        // Y que NO hayan fallado previamente (NUEVO FILTRO)
        call_status: {
          notIn: ['NO_ANSWER', 'FAILED']
        }
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
    
    logger.info(`Encontrados ${pendingOrders.length} pedidos realmente pendientes`);

    // Filtrar por antigüedad y marcar expirados
    const validOrders = [];
    
    for (const order of pendingOrders) {
      // Verificar que no sea muy antiguo (máximo 24 horas)
      const hoursOld = (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
      
      if (hoursOld > 24) {
        logger.info(`Orden ${order.internal_order_number} muy antigua (${hoursOld.toFixed(1)}h), marcando como expirada`);
        
        // Marcar como expirada en background (no await para no bloquear)
        db.orderConfirmation.update({
          where: { id: order.id },
          data: { 
            status: 'EXPIRED',
            call_status: 'FAILED',
            updated_at: new Date()
          }
        }).catch(error => logger.error('Error marcando orden como expirada', { error }));
        
        continue; // No incluir en resultados
      }
      
      validOrders.push(order);
    }

    logger.info(`${validOrders.length} pedidos válidos después de filtros de antigüedad`);
    
    // Para N8N, devolver los items con información completa
    const orders = validOrders.map(order => {
      // Procesar productos
      let products: Array<{title: string, quantity: number, price: number}> = [];
      if (order.order_items) {
        try {
          const items = typeof order.order_items === 'string' 
            ? JSON.parse(order.order_items) 
            : order.order_items;
          if (Array.isArray(items)) {
            products = items.map(item => ({
              title: item.title || item.name || 'Producto',
              quantity: item.quantity || 1,
              price: item.price || 0
            }));
          }
        } catch (error) {
          logger.warn(`Error procesando productos para orden ${order.internal_order_number}`, { error });
        }
      }
      
      // Procesar dirección
      let shipping_address = null;
      if (order.shipping_address) {
        try {
          shipping_address = typeof order.shipping_address === 'string'
            ? JSON.parse(order.shipping_address)
            : order.shipping_address;
        } catch (error) {
          logger.warn(`Error procesando dirección para orden ${order.internal_order_number}`, { error });
        }
      }
      
      return {
        id: order.id,
        customer_phone: order.customer_phone,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        shop_domain: order.shop?.shop_domain,
        order_total: order.order_total,
        shop_currency: order.shop_currency,
        internal_order_number: order.internal_order_number,
        shopify_order_name: order.shopify_order_name,
        products: products,
        shipping_address: shipping_address,
        created_at: order.created_at,
        // Información adicional útil para N8N
        call_status: order.call_status,
        vonage_call_uuid: order.vonage_call_uuid,
        // Información de debugging
        hours_old: Math.floor((Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60))
      };
    });

    // Log detallado para cada orden
    orders.forEach(order => {
      logger.info(`Orden válida: ${order.internal_order_number} - ${order.hours_old}h de antigüedad`);
    });

    return json(orders);
    
  } catch (error) {
    logger.error('Error obteniendo pedidos pendientes', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}