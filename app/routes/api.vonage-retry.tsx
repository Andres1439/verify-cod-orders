// app/routes/api.vonage-retry.tsx - ENDPOINT PARA REINTENTOS DE LLAMADAS
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logger } from "../utils/logger.server";

// 🔄 GET - Obtener pedidos que necesitan reintento
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const hoursAgo = parseInt(url.searchParams.get('hoursAgo') || '2');
    
    logger.info(`Buscando pedidos para reintento (límite: ${limit}, hace ${hoursAgo}h)`);
    
    // Calcular fecha límite (hace X horas)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);
    
    // Obtener pedidos que necesitan reintento
    const retryOrders = await db.orderConfirmation.findMany({
      where: {
        AND: [
          // Estados que necesitan reintento
          {
            OR: [
              { call_status: 'NO_ANSWER' },
              { call_status: 'FAILED' }
            ]
          },
          // Que no estén ya confirmados o declinados
          {
            status: {
              notIn: ['CONFIRMED', 'DECLINED', 'EXPIRED']
            }
          },
          // Que hayan sido actualizados hace al menos X horas
          {
            updated_at: {
              lt: cutoffDate
            }
          },
          // Que no sean muy antiguos (máximo 48 horas)
          {
            created_at: {
              gte: new Date(Date.now() - 48 * 60 * 60 * 1000)
            }
          }
        ]
      },
      include: {
        shop: {
          select: {
            shop_domain: true
          }
        }
      },
      orderBy: {
        updated_at: 'asc' // Los más antiguos primero
      },
      take: limit
    });
    
    logger.info(`Encontrados ${retryOrders.length} pedidos para reintento`);
    
    // Filtrar por horarios apropiados (9 AM - 8 PM)
    // Usar timezone del pedido o fallback a America/Lima
    const validOrders = retryOrders.filter(order => {
      const now = new Date();
      const timezone = order.shop_timezone || 'America/Lima';
      
      try {
        // Obtener hora local de la tienda usando Intl.DateTimeFormat
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          hour12: false
        });
        const timeString = formatter.format(now);
        const hour = parseInt(timeString.replace(/\D/g, ''));
        
        // Solo permitir llamadas entre 9 AM y 8 PM
        const isValidHour = hour >= 9 && hour <= 20;
        
        if (!isValidHour) {
          logger.info(`Orden ${order.internal_order_number} fuera de horario (${hour}h en ${timezone})`);
          return false;
        }
        
        return true;
      } catch (error) {
        logger.warn(`Error procesando timezone para ${order.internal_order_number}`, { error });
        // Si hay error con timezone, usar horario UTC como fallback
        const hour = now.getUTCHours();
        return hour >= 9 && hour <= 20;
      }
    });
    
    logger.info(`${validOrders.length} pedidos válidos para reintento en horario apropiado`);
    
    // Formatear respuesta para N8N
    const orders = validOrders.map(order => {
      // Calcular cuántos reintentos ha tenido basado en call_started_at vs created_at
      const timeSinceCreated = order.call_started_at 
        ? new Date(order.call_started_at).getTime() - new Date(order.created_at).getTime()
        : 0;
      
      // Estimar número de reintentos (cada 2+ horas = 1 reintento)
      const estimatedRetries = Math.floor(timeSinceCreated / (2 * 60 * 60 * 1000));
      
      return {
        id: order.id,
        internal_order_number: order.internal_order_number,
        customer_phone: order.customer_phone,
        customer_name: order.customer_name,
        shop_domain: order.shop?.shop_domain,
        call_status: order.call_status,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        call_started_at: order.call_started_at,
        estimated_retries: estimatedRetries,
        hours_since_last_update: Math.floor((Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60)),
        shop_timezone: order.shop_timezone
      };
    });
    
    // Log detallado para debugging
    orders.forEach(order => {
      logger.info(`Reintento: ${order.internal_order_number} - ${order.call_status} - ${order.hours_since_last_update}h ago`);
    });
    
    return json({
      success: true,
      count: orders.length,
      orders: orders,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error obteniendo pedidos para reintento', { error });
    return json({ 
      success: false,
      error: 'Failed to fetch retry orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 🔄 POST - Marcar pedido como reintentado (actualizar timestamps)
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { orderId, action: actionType } = await request.json();
    
    if (!orderId) {
      return json({ error: 'Order ID is required' }, { status: 400 });
    }
    
    logger.info(`Procesando acción de reintento: ${actionType} para orden: ${orderId}`);
    
    let updateData: any = {
      updated_at: new Date(),
      last_event_at: new Date()
    };
    
    switch (actionType) {
      case 'retry_attempted':
        // Marcar que se intentó un reintento
        updateData.call_started_at = new Date();
        updateData.call_status = 'PENDING';
        break;
        
      case 'mark_expired':
        // Marcar como expirado después de múltiples reintentos
        updateData.status = 'EXPIRED';
        updateData.call_status = 'FAILED';
        updateData.expires_at = new Date();
        break;
        
      default:
        return json({ error: 'Invalid action type' }, { status: 400 });
    }
    
    const result = await db.orderConfirmation.update({
      where: { id: orderId },
      data: updateData
    });
    
    logger.info(`Orden ${orderId} actualizada para reintento`, { actionType });
    
    return json({
      success: true,
      orderId: orderId,
      action: actionType,
      updated_at: result.updated_at
    });
    
  } catch (error) {
    logger.error('Error procesando acción de reintento', { error });
    return json({ 
      error: 'Failed to process retry action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
