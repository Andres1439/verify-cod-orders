// app/routes/api.vonage-events.tsx - VERSIÓN COMPLETA ACTUALIZADA
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logger } from "../utils/logger.server";
import { CallStatus, OrderConfirmationStatus } from "@prisma/client";

// 🏷️ FUNCIÓN PARA ACTUALIZAR ETIQUETAS EN SHOPIFY - VERSIÓN CORREGIDA 2025-07
async function updateShopifyOrderTags(callUuid: string, newTag: string) {
  try {
    logger.info(`Actualizando etiqueta en Shopify: ${newTag} para call: ${callUuid}`);
    
    // Obtener información de la orden desde la BD
    const orderData = await db.orderConfirmation.findFirst({
      where: {
        vonage_call_uuid: callUuid
      },
      include: {
        shop: true
      }
    });
    
    if (!orderData || !orderData.shopify_order_id) {
      logger.warn(`No se encontró orden o shopify_order_id para call: ${callUuid}`, {
        hasOrderData: !!orderData,
        hasShopifyOrderId: !!orderData?.shopify_order_id,
        callUuid
      });
      return;
    }
    
    if (!orderData.shop?.access_token) {
      logger.warn(`No hay access_token para la tienda: ${orderData.shop?.shop_domain}`, {
        shopDomain: orderData.shop?.shop_domain,
        callUuid
      });
      return;
    }
    
    // Construir el GID de Shopify
    const shopifyOrderGid = `gid://shopify/Order/${orderData.shopify_order_id}`;
    logger.info(`Procesando orden Shopify desde events`, {
      shopifyOrderGid,
      shopDomain: orderData.shop.shop_domain,
      orderName: orderData.shopify_order_name,
      newTag
    });
    
    // PASO 1: Obtener las etiquetas actuales usando API 2025-07
    const getOrderQuery = `
      query GetOrder($id: ID!) {
        order(id: $id) {
          id
          tags
        }
      }
    `;
    
    const getResponse = await fetch(`https://${orderData.shop.shop_domain}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': orderData.shop.access_token
      },
      body: JSON.stringify({
        query: getOrderQuery,
        variables: { id: shopifyOrderGid }
      })
    });
    
    if (!getResponse.ok) {
      logger.error(`Error HTTP obteniendo orden de Shopify desde events`, {
        status: getResponse.status,
        statusText: getResponse.statusText,
        shopifyOrderGid
      });
      return;
    }
    
    const getResult = await getResponse.json();
    
    if (getResult.errors) {
      logger.error(`Error GraphQL obteniendo orden de Shopify desde events`, { 
        errors: getResult.errors,
        shopifyOrderGid 
      });
      return;
    }
    
    // PASO 2: Limpiar etiquetas de llamadas previas y agregar la nueva
    const currentTags = getResult.data?.order?.tags || [];
    logger.info(`Etiquetas actuales en Shopify desde events`, { currentTags, shopifyOrderGid });
    
    // Filtrar etiquetas relacionadas con llamadas (nuevos y viejos nombres)
    const cleanTags = currentTags.filter((tag: string) => 
      !tag.includes('cod-confirmado') && 
      !tag.includes('cod-cancelado') && 
      !tag.includes('cod-sin-respuesta') &&
      !tag.includes('confirmado-por-llamada') &&
      !tag.includes('cancelado-por-llamada') &&
      !tag.includes('sin-respuesta-llamada')
    );
    
    // Agregar la nueva etiqueta
    const finalTags = [...cleanTags, newTag];
    logger.info(`Etiquetas finales a aplicar desde events`, { 
      removed: currentTags.length - cleanTags.length,
      finalTags,
      newTag
    });
    
    // PASO 3: Actualizar usando orderUpdate con API 2025-07
    const updateMutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const updateResponse = await fetch(`https://${orderData.shop.shop_domain}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': orderData.shop.access_token
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: {
          input: {
            id: shopifyOrderGid,
            tags: finalTags
          }
        }
      })
    });
    
    if (!updateResponse.ok) {
      logger.error(`Error HTTP actualizando etiquetas en Shopify desde events`, {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        shopifyOrderGid
      });
      return;
    }
    
    const updateResult = await updateResponse.json();
    
    if (updateResult.errors) {
      logger.error(`Error GraphQL actualizando etiquetas en Shopify desde events`, { 
        errors: updateResult.errors,
        shopifyOrderGid
      });
      return;
    }
    
    if (updateResult.data?.orderUpdate?.userErrors?.length > 0) {
      logger.error(`UserErrors actualizando etiquetas en Shopify desde events`, { 
        userErrors: updateResult.data.orderUpdate.userErrors,
        shopifyOrderGid
      });
      return;
    }
    
    // ÉXITO: Log detallado del resultado
    const updatedTags = updateResult.data?.orderUpdate?.order?.tags || [];
    logger.info(`✅ Etiqueta actualizada exitosamente en Shopify desde events`, { 
      order: orderData.shopify_order_name,
      shopifyOrderGid,
      newTag,
      previousTagCount: currentTags.length,
      finalTagCount: updatedTags.length,
      allTags: updatedTags
    });
    
  } catch (error) {
    logger.error(`Error crítico actualizando etiqueta en Shopify desde events`, { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      newTag, 
      callUuid 
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const eventData = await request.json();
    const { status, uuid: callUuid, timestamp, reason } = eventData;

    logger.info("Call event received", { status, callUuid, timestamp, reason });

    if (!status || !callUuid) {
      return json({ message: "Event ignored - missing data" }, { status: 200 });
    }

    // Mapear estados de Vonage a nuestros estados - VERSIÓN ACTUALIZADA
    const statusMap: Record<string, { call_status: CallStatus; order_status?: OrderConfirmationStatus; shouldTag?: string }> = {
      // Estados en progreso
      started: { call_status: CallStatus.PENDING },
      ringing: { call_status: CallStatus.PENDING },
      answered: { call_status: CallStatus.PENDING },
      
      // Estados finales exitosos
      completed: { call_status: CallStatus.COMPLETED },
      
      // Estados de fallo - TODOS van a NO_ANSWER para evitar reintentos
      failed: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      timeout: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      unanswered: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      busy: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      cancelled: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      rejected: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      // Números inválidos
      invalid_number: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
      unallocated_number: { 
        call_status: CallStatus.NO_ANSWER, 
        order_status: OrderConfirmationStatus.NO_ANSWER,
        shouldTag: "sin-respuesta-llamada"
      },
    };

    const mappedData = statusMap[status];
    
    if (!mappedData) {
      logger.warn(`Unknown Vonage status: ${status}`);
      return json({ message: "Unknown status ignored" }, { status: 200 });
    }

    // Solo actualizar para eventos finales
    const finalStates = [
      "completed", "failed", "timeout", "unanswered", 
      "busy", "cancelled", "rejected", "invalid_number", "unallocated_number"
    ];

    if (finalStates.includes(status)) {
      // Preparar datos de actualización
      const updateData: any = {
        call_status: mappedData.call_status,
        last_event_at: new Date(),
        updated_at: new Date(),
      };

      // Si hay order_status específico, actualizarlo también
      if (mappedData.order_status) {
        updateData.status = mappedData.order_status;
      }

      // Actualizar en base de datos
      const result = await db.orderConfirmation.updateMany({
        where: {
          vonage_call_uuid: callUuid,
        },
        data: updateData,
      });

      logger.info("Call status updated", {
        callUuid,
        vonageStatus: status,
        callStatus: mappedData.call_status,
        orderStatus: mappedData.order_status,
        updatedRecords: result.count,
        reason: reason || 'N/A'
      });

      // Actualizar etiqueta en Shopify si es necesario
      if (mappedData.shouldTag && result.count > 0) {
        await updateShopifyOrderTags(callUuid, mappedData.shouldTag);
      }
    } else {
      // Para estados no finales, solo actualizar call_status
      const result = await db.orderConfirmation.updateMany({
        where: {
          vonage_call_uuid: callUuid,
        },
        data: {
          call_status: mappedData.call_status,
          last_event_at: new Date(),
          updated_at: new Date(),
        },
      });

      logger.info("Call status updated (non-final)", {
        callUuid,
        vonageStatus: status,
        callStatus: mappedData.call_status,
        updatedRecords: result.count
      });
    }

    return json({ message: "Event processed" }, { status: 200 });
  } catch (error) {
    logger.error("Error processing call event", { error });
    return json({ error: "Internal server error" }, { status: 500 });
  }
}