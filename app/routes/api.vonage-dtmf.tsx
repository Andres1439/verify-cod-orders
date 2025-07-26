// app/routes/api.vonage-dtmf.tsx - VERSIÓN COMPLETA ACTUALIZADA
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { logger } from "../utils/logger.server";

// 🏪 FUNCIÓN PARA ACTUALIZAR NOTA EN SHOPIFY
async function updateShopifyOrderNote(callUuid: string, orderId: string | null) {
  try {
    logger.info(`Actualizando nota en Shopify para call: ${callUuid}`);
    
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
      logger.warn(`No se encontró orden o shopify_order_id para call: ${callUuid}`);
      return;
    }
    
    if (!orderData.shop?.access_token) {
      logger.warn(`No hay access_token para la tienda: ${orderData.shop?.shop_domain}`);
      return;
    }
    
    // Crear sesión de Shopify
    const shopifySession = {
      shop: orderData.shop.shop_domain,
      accessToken: orderData.shop.access_token
    };
    
    // Construir el GID de Shopify
    const shopifyOrderGid = `gid://shopify/Order/${orderData.shopify_order_id}`;
    
    // Mutation para actualizar la nota
    const mutation = `
      mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        id: shopifyOrderGid,
        note: "Confirmado por llamada telefónica"
      }
    };
    
    // Realizar la mutación
    const response = await fetch(`https://${orderData.shop.shop_domain}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': orderData.shop.access_token
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables
      })
    });
    
    const result = await response.json();
    
    if (result.errors) {
      logger.error(`Error en GraphQL de Shopify`, { errors: result.errors });
      return;
    }
    
    if (result.data?.orderUpdate?.userErrors?.length > 0) {
      logger.error(`Errores de usuario en Shopify`, { userErrors: result.data.orderUpdate.userErrors });
      return;
    }
    
    logger.info(`Nota actualizada en Shopify para orden ${orderData.shopify_order_name}`, { note: result.data?.orderUpdate?.order?.note });
    
  } catch (error) {
    logger.error(`Error actualizando nota en Shopify`, { error, callUuid });
  }
}

// 🏷️ FUNCIÓN PARA ACTUALIZAR ETIQUETAS EN SHOPIFY - VERSIÓN CORREGIDA 2025-04
async function updateShopifyOrderTags(callUuid: string, newTag: string) {
  try {
    logger.info(`Actualizando etiqueta en Shopify: ${newTag} para call: ${callUuid}`);
    
    const orderData = await db.orderConfirmation.findFirst({
      where: { vonage_call_uuid: callUuid },
      include: { shop: true }
    });
    
    if (!orderData || !orderData.shopify_order_id || !orderData.shop?.access_token) {
      logger.warn(`Datos insuficientes para actualizar etiquetas en Shopify`, {
        hasOrderData: !!orderData,
        hasShopifyOrderId: !!orderData?.shopify_order_id,
        hasAccessToken: !!orderData?.shop?.access_token,
        callUuid
      });
      return;
    }
    
    const shopifyOrderGid = `gid://shopify/Order/${orderData.shopify_order_id}`;
    logger.info(`Procesando orden Shopify`, {
      shopifyOrderGid,
      shopDomain: orderData.shop.shop_domain,
      orderName: orderData.shopify_order_name
    });
    
    // PASO 1: Obtener etiquetas actuales usando API 2025-04
    const getOrderQuery = `
      query GetOrder($id: ID!) {
        order(id: $id) {
          id
          tags
        }
      }
    `;
    
    const getResponse = await fetch(`https://${orderData.shop.shop_domain}/admin/api/2025-04/graphql.json`, {
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
      logger.error(`Error HTTP obteniendo orden de Shopify`, {
        status: getResponse.status,
        statusText: getResponse.statusText,
        shopifyOrderGid
      });
      return;
    }
    
    const getResult = await getResponse.json();
    
    if (getResult.errors) {
      logger.error(`Error GraphQL obteniendo orden de Shopify`, { 
        errors: getResult.errors,
        shopifyOrderGid 
      });
      return;
    }
    
    // PASO 2: Limpiar etiquetas de llamadas previas y agregar la nueva
    const currentTags = getResult.data?.order?.tags || [];
    logger.info(`Etiquetas actuales en Shopify`, { currentTags, shopifyOrderGid });
    
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
    logger.info(`Etiquetas finales a aplicar`, { 
      removed: currentTags.length - cleanTags.length,
      finalTags,
      newTag
    });
    
    // PASO 3: Actualizar usando orderUpdate con API 2025-04
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
    
    const updateResponse = await fetch(`https://${orderData.shop.shop_domain}/admin/api/2025-04/graphql.json`, {
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
      logger.error(`Error HTTP actualizando etiquetas en Shopify`, {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        shopifyOrderGid
      });
      return;
    }
    
    const updateResult = await updateResponse.json();
    
    if (updateResult.errors) {
      logger.error(`Error GraphQL actualizando etiquetas en Shopify`, { 
        errors: updateResult.errors,
        shopifyOrderGid
      });
      return;
    }
    
    if (updateResult.data?.orderUpdate?.userErrors?.length > 0) {
      logger.error(`UserErrors actualizando etiquetas en Shopify`, { 
        userErrors: updateResult.data.orderUpdate.userErrors,
        shopifyOrderGid
      });
      return;
    }
    
    // ÉXITO: Log detallado del resultado
    const updatedTags = updateResult.data?.orderUpdate?.order?.tags || [];
    logger.info(`✅ Etiqueta actualizada exitosamente en Shopify`, { 
      order: orderData.shopify_order_name,
      shopifyOrderGid,
      newTag,
      previousTagCount: currentTags.length,
      finalTagCount: updatedTags.length,
      allTags: updatedTags
    });
    
  } catch (error) {
    logger.error(`Error crítico actualizando etiqueta en Shopify`, { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      newTag, 
      callUuid 
    });
  }
}

// 🔧 FUNCIÓN HELPER PARA MANEJAR DTMF
async function handleDTMFWebhook(request: Request) {
  const url = new URL(request.url);
  let callUuid = url.searchParams.get("call_uuid");
  let orderId = url.searchParams.get("order_id");
  let dtmf: string | null = null;

  const isRetry = url.searchParams.get("retry") === "true";
  logger.info(`DTMF webhook called (${request.method})`, { callUuid, orderId, isRetry });

  try {
    if (request.method === "POST") {
      const body = await request.json();
      dtmf = body.dtmf;
      
      // También pueden venir en el body
      callUuid = callUuid || body.call_uuid;
      orderId = orderId || body.order_id;
      
      logger.debug("DTMF body", { body });
    } else {
      // GET request
      dtmf = url.searchParams.get("dtmf");
    }
  } catch (error) {
    logger.error("Error parsing DTMF request", { error });
    dtmf = url.searchParams.get("dtmf");
  }

  logger.info("DTMF received", { dtmf, callUuid, orderId, isRetry });

  if (!callUuid) {
    logger.error("Call UUID is required");
    return json({ error: "Call UUID is required" }, { status: 400 });
  }

  // Procesar respuesta DTMF con sistema de reintento
  let orderStatus = "";
  let responseMessage = "";
  let shouldRetry = false;

  switch (dtmf) {
    case "1":
      orderStatus = "CONFIRMED";
      responseMessage = "Perfecto, tu pedido ha sido confirmado. Gracias por tu compra.";
      break;
    case "2":
      orderStatus = "DECLINED";
      responseMessage = "Entendido, tu pedido ha sido cancelado. No se realizará ningún cargo. Gracias.";
      break;
    default:
      // Número inválido - verificar si es reintento
      if (isRetry) {
        // Ya es el segundo intento, terminar llamada
        orderStatus = "NO_ANSWER";
        responseMessage = "No pudimos procesar tu respuesta. Te puedes contactar nuevamente para solucionarlo.";
      } else {
        // Primer intento inválido - dar segunda oportunidad
        shouldRetry = true;
        orderStatus = "RETRY";
        responseMessage = "Opción no válida. Por favor, presiona 1 para confirmar tu pedido o 2 para cancelarlo.";
      }
      break;
  }

  // Actualizar base de datos
  const updateData: any = {
    dtmf_response: dtmf,
    updated_at: new Date(),
  };

  if (orderStatus === "CONFIRMED") {
    updateData.status = "CONFIRMED";
    updateData.call_status = "COMPLETED";
    updateData.confirmed_at = new Date();
    
    // Actualizar nota Y etiqueta en Shopify cuando se confirma
    await updateShopifyOrderNote(callUuid, orderId);
    await updateShopifyOrderTags(callUuid, "confirmado-por-llamada");
    
  } else if (orderStatus === "DECLINED") {
    updateData.status = "DECLINED";
    updateData.call_status = "COMPLETED";
    updateData.declined_at = new Date();
    
    // Actualizar etiqueta en Shopify cuando se cancela
    await updateShopifyOrderTags(callUuid, "cancelado-por-llamada");
    
  } else if (orderStatus === "RETRY") {
    // No cambiar el status, mantener PENDING_CALL para permitir reintento
    // call_status se mantiene como PENDING
    updateData.retry_count = updateData.retry_count ? updateData.retry_count + 1 : 1;
  } else {
    // Para casos de NO_ANSWER (no contesta o 2 intentos fallidos)
    updateData.status = "NO_ANSWER";
    if (isRetry) {
      // 2 intentos fallidos = FAILED en call_status
      updateData.call_status = "FAILED";
      await updateShopifyOrderTags(callUuid, "cod-sin-respuesta");
    } else {
      // No contesta = NO_ANSWER en call_status
      updateData.call_status = "NO_ANSWER";
    }
  }

  try {
    const updateResult = await db.orderConfirmation.updateMany({
      where: {
        vonage_call_uuid: callUuid,
      },
      data: updateData,
    });

    logger.info("Order status updated", { 
      callUuid, 
      orderStatus, 
      dtmf, 
      isRetry,
      shouldRetry,
      recordsUpdated: updateResult.count 
    });
  } catch (dbError) {
    logger.error("Database update error", { error: dbError });
  }

  // Responder con NCCO - incluir reintento si es necesario
  let responseNCCO;
  
  if (shouldRetry) {
    // Dar segunda oportunidad con nuevo input
    responseNCCO = [
      {
        action: "talk",
        text: responseMessage,
        language: "es-ES"
      },
      {
        action: "input",
        eventUrl: [`${process.env.APP_URL?.replace(/\/$/, '')}/api/vonage-dtmf?call_uuid=${callUuid}&order_id=${orderId}&retry=true`],
        timeOut: 5,
        maxDigits: 1
      }
    ];
  } else {
    // Respuesta final (confirmado, cancelado o sin respuesta)
    responseNCCO = [
      {
        action: "talk",
        text: responseMessage,
        language: "es-ES",
        style: 0,
        bargeIn: false
      }
    ];
  }

  logger.debug("Final NCCO", { ncco: responseNCCO });

  // Asegurar headers correctos
  return json(responseNCCO, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

// 📞 POST - Método principal para DTMF
export async function action({ request }: ActionFunctionArgs) {
  logger.info("DTMF webhook POST called", {
    url: request.url,
    timestamp: new Date().toISOString()
  });  
  try {
    const result = await handleDTMFWebhook(request);
    logger.info("DTMF webhook POST success");
    return result;
  } catch (error) {
    logger.error("Error processing DTMF (POST)", { error });
    return json([
      {
        action: "talk",
        text: "Gracias por tu respuesta.",
        language: "es-ES"
      }
    ], {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }
}

// 📞 GET - Método adicional para DTMF (por si acaso)
export async function loader({ request }: LoaderFunctionArgs) {
  logger.info("DTMF webhook GET called", {
    url: request.url,
    timestamp: new Date().toISOString()
  });  
  try {
    const result = await handleDTMFWebhook(request);
    logger.info("DTMF webhook GET success");
    return result;
  } catch (error) {
    logger.error("Error processing DTMF (GET)", { error });
    return json([
      {
        action: "talk",
        text: "Gracias por tu respuesta.",
        language: "es-ES"
      }
    ], {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }
}