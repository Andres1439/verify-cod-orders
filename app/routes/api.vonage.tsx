/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/api.vonage.tsx - API completa para manejo de Vonage
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { logger } from "../utils/logger.server";
import { RateLimiter } from "../utils/rate-limiter.server";

// ✅ TIPOS PARA TYPESCRIPT
interface VonageConfirmRequest {
  phone: string;
  action: "confirm" | "decline" | "no_answer";
  vonage_call_uuid?: string;
  dtmf_response?: string;
  call_duration?: number;
}

interface VonageConfigRequest {
  application_id: string;
  private_key: string;
  phone_number: string;
  webhook_base_url: string;
  voice_language?: string;
  voice_style?: number;
  call_timeout?: number;
  dtmf_timeout?: number;
}

interface VonageWebhookEvent {
  uuid: string;
  status: string;
  from?: string;
  to?: string;
  direction?: string;
  timestamp?: string;
  duration?: number;
  conversation_uuid?: string;
}

interface ShopifyGraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    extensions?: any;
  }>;
}

// ✅ FUNCIÓN PARA GENERAR ID ÚNICO DE REQUEST
function generateRequestId(type: string = "vonage"): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ✅ FUNCIÓN PARA DETERMINAR EL TIPO DE REQUEST
function getRequestType(body: any): string {
  // Si tiene "action" es confirmación
  if (
    body.action &&
    ["confirm", "decline", "no_answer"].includes(body.action)
  ) {
    return "confirm";
  }

  // Si tiene "uuid" y "status" es webhook
  if (body.uuid && body.status) {
    return "webhook";
  }

  // Si tiene "application_id" es configuración
  if (body.application_id || body.private_key) {
    return "config";
  }

  return "unknown";
}

// ✅ VALIDACIONES
function validateConfirmRequest(body: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!body.phone || body.phone.trim() === "") {
    errors.push("Número de teléfono es requerido");
  }

  if (
    !body.action ||
    !["confirm", "decline", "no_answer"].includes(body.action)
  ) {
    errors.push("Acción inválida. Debe ser: confirm, decline, o no_answer");
  }

  if (body.phone && body.phone.length < 8) {
    errors.push("Número de teléfono muy corto");
  }

  return { isValid: errors.length === 0, errors };
}

function validateConfigRequest(data: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.application_id || data.application_id.trim() === "") {
    errors.push("Application ID es requerido");
  }

  if (!data.private_key || data.private_key.trim() === "") {
    errors.push("Private Key es requerido");
  }

  if (!data.phone_number || data.phone_number.trim() === "") {
    errors.push("Número de teléfono es requerido");
  }

  if (!data.webhook_base_url || data.webhook_base_url.trim() === "") {
    errors.push("Base URL para webhooks es requerida");
  }

  if (data.webhook_base_url) {
    try {
      new URL(data.webhook_base_url);
    } catch {
      errors.push("Base URL no es válida");
    }
  }

  if (data.phone_number && !/^\+?[\d\s-()]+$/.test(data.phone_number)) {
    errors.push("Formato de número de teléfono inválido");
  }

  return { isValid: errors.length === 0, errors };
}

function validateWebhookEvent(body: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!body.uuid || body.uuid.trim() === "") {
    errors.push("UUID del evento es requerido");
  }

  if (!body.status || body.status.trim() === "") {
    errors.push("Status del evento es requerido");
  }

  return { isValid: errors.length === 0, errors };
}

// ✅ FUNCIONES DE BÚSQUEDA Y ACTUALIZACIÓN
async function findOrderByPhone(phone: string, requestId: string) {
  try {
    const phoneSearch = phone.slice(-9);

    logger.info("Buscando orden por teléfono", {
      requestId,
      phoneSearch,
      originalPhone: phone,
    });

    const orderConfirmation = await prisma.orderConfirmation.findFirst({
      where: {
        customer_phone: {
          contains: phoneSearch,
        },
        status: "PENDING_CALL",
      },
      include: {
        shop: true,
      },
    });

    if (!orderConfirmation) {
      logger.warn("No se encontró orden pendiente", { requestId, phoneSearch });
      return null;
    }

    logger.info("Orden encontrada", {
      requestId,
      orderId: orderConfirmation.id,
      internalOrderNumber: orderConfirmation.internal_order_number,
      shopifyOrderId: orderConfirmation.shopify_order_id,
    });

    return orderConfirmation;
  } catch (error) {
    logger.error("Error buscando orden por teléfono", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

async function updateOrderStatus(
  orderId: string,
  status: "CONFIRMED" | "DECLINED" | "NO_ANSWER",
  vonageData: {
    vonage_call_uuid?: string;
    dtmf_response?: string;
    call_duration?: number;
  },
  requestId: string,
) {
  try {
    logger.info("Actualizando estado de orden", {
      requestId,
      orderId,
      newStatus: status,
      vonageCallUuid: vonageData.vonage_call_uuid,
    });

    const updateData: any = {
      status: status,
      vonage_call_uuid: vonageData.vonage_call_uuid,
      dtmf_response: vonageData.dtmf_response,
      updated_at: new Date(),
    };

    if (status === "CONFIRMED") {
      updateData.confirmed_at = new Date();
    } else if (status === "DECLINED") {
      updateData.declined_at = new Date();
    }

    const updatedOrder = await prisma.orderConfirmation.update({
      where: { id: orderId },
      data: updateData,
    });

    logger.info("Orden actualizada exitosamente", {
      requestId,
      orderId,
      status: updatedOrder.status,
    });

    return updatedOrder;
  } catch (error) {
    logger.error("Error actualizando orden", {
      requestId,
      orderId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

async function updateCallUUID(uuid: string, phone: string, requestId: string) {
  try {
    if (!phone || !uuid) {
      logger.warn("Datos insuficientes para actualizar UUID", {
        requestId,
        hasPhone: !!phone,
        hasUuid: !!uuid,
      });
      return;
    }

    const phoneSearch = phone.slice(-9);

    const updateResult = await prisma.orderConfirmation.updateMany({
      where: {
        customer_phone: {
          contains: phoneSearch,
        },
        status: "PENDING_CALL",
      },
      data: {
        vonage_call_uuid: uuid,
        updated_at: new Date(),
      },
    });

    logger.info("UUID de llamada actualizado", {
      requestId,
      uuid,
      phoneSearch,
      updatedCount: updateResult.count,
    });
  } catch (error) {
    logger.error("Error actualizando UUID", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// ✅ FUNCIÓN PARA ACTUALIZAR SHOPIFY
async function updateShopifyOrder(
  admin: any,
  shopifyOrderId: string,
  action: "confirm" | "decline",
  requestId: string,
): Promise<{ success: boolean; orderName?: string }> {
  try {
    logger.info("Actualizando orden en Shopify", {
      requestId,
      shopifyOrderId,
      action,
    });

    const tags =
      action === "confirm"
        ? ["confirmado-por-llamada", "verificado-cod"]
        : ["cancelado-por-llamada", "cod-rechazado"];

    // Intentar actualizar como orden normal
    const orderUpdateResponse = await admin.graphql(
      `#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            name
            tags
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            id: `gid://shopify/Order/${shopifyOrderId}`,
            tags: tags,
          },
        },
      },
    );

    const orderResult: ShopifyGraphQLResponse =
      await orderUpdateResponse.json();

    if (orderResult.data?.orderUpdate?.order) {
      logger.info("Orden actualizada en Shopify", {
        requestId,
        orderName: orderResult.data.orderUpdate.order.name,
      });
      return {
        success: true,
        orderName: orderResult.data.orderUpdate.order.name || undefined,
      };
    }

    // Intentar como Draft Order
    const draftOrderResponse = await admin.graphql(
      `#graphql
      query getDraftOrder($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          status
        }
      }`,
      {
        variables: {
          id: `gid://shopify/DraftOrder/${shopifyOrderId}`,
        },
      },
    );

    const draftResult: ShopifyGraphQLResponse = await draftOrderResponse.json();

    if (draftResult.data?.draftOrder) {
      if (action === "confirm") {
        // Completar draft order
        const completeResponse = await admin.graphql(
          `#graphql
          mutation draftOrderComplete($id: ID!) {
            draftOrderComplete(id: $id) {
              draftOrder {
                id
                status
                order {
                  id
                  name
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              id: `gid://shopify/DraftOrder/${shopifyOrderId}`,
            },
          },
        );

        const completeResult: ShopifyGraphQLResponse =
          await completeResponse.json();

        if (completeResult.data?.draftOrderComplete?.draftOrder?.order) {
          const newOrderId =
            completeResult.data.draftOrderComplete.draftOrder.order.id;
          const orderName =
            completeResult.data.draftOrderComplete.draftOrder.order.name;

          // Agregar tags
          await admin.graphql(
            `#graphql
            mutation orderUpdate($input: OrderInput!) {
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
            }`,
            {
              variables: {
                input: {
                  id: newOrderId,
                  tags: tags,
                },
              },
            },
          );

          logger.info("Draft Order completada", { requestId, orderName });
          return { success: true, orderName: orderName || undefined };
        }
      } else if (action === "decline") {
        // Eliminar draft order
        const deleteResponse = await admin.graphql(
          `#graphql
          mutation draftOrderDelete($input: DraftOrderDeleteInput!) {
            draftOrderDelete(input: $input) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              input: {
                id: `gid://shopify/DraftOrder/${shopifyOrderId}`,
              },
            },
          },
        );

        const deleteResult: ShopifyGraphQLResponse =
          await deleteResponse.json();

        if (deleteResult.data?.draftOrderDelete?.deletedId) {
          logger.info("Draft Order eliminada", { requestId });
          return { success: true };
        }
      }
    }

    return { success: false, orderName: undefined };
  } catch (error) {
    logger.error("Error actualizando Shopify", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, orderName: undefined };
  }
}

// ✅ MANEJADORES ESPECÍFICOS
async function handleConfirmRequest(
  body: VonageConfirmRequest,
  requestId: string,
  request: Request,
) {
  const validation = validateConfirmRequest(body);
  if (!validation.isValid) {
    return json({ error: validation.errors.join(", ") }, { status: 400 });
  }

  // Rate limiting
  const clientIP =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  const rateLimitResult = await RateLimiter.checkLimit(
    `vonage-confirm-${clientIP}`,
    20,
    60000,
    300000,
  );

  if (!rateLimitResult.allowed) {
    return json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  // Buscar orden
  const orderConfirmation = await findOrderByPhone(body.phone, requestId);
  if (!orderConfirmation) {
    return json(
      {
        success: false,
        error: "No se encontró orden pendiente para este teléfono",
      },
      { status: 404 },
    );
  }

  // Determinar estado
  let newStatus: "CONFIRMED" | "DECLINED" | "NO_ANSWER";
  switch (body.action) {
    case "confirm":
      newStatus = "CONFIRMED";
      break;
    case "decline":
      newStatus = "DECLINED";
      break;
    case "no_answer":
      newStatus = "NO_ANSWER";
      break;
    default:
      return json({ error: "Acción inválida" }, { status: 400 });
  }

  // Actualizar BD
  const updatedOrder = await updateOrderStatus(
    orderConfirmation.id,
    newStatus,
    {
      vonage_call_uuid: body.vonage_call_uuid,
      dtmf_response: body.dtmf_response,
      call_duration: body.call_duration,
    },
    requestId,
  );

  let shopifyResult = {
    success: false,
    orderName: undefined as string | undefined,
  };

  // Actualizar Shopify
  if (
    orderConfirmation.shopify_order_id &&
    (body.action === "confirm" || body.action === "decline")
  ) {
    try {
      const { admin } = await authenticate.admin(request);
      shopifyResult = await updateShopifyOrder(
        admin,
        orderConfirmation.shopify_order_id,
        body.action,
        requestId,
      );
    } catch (shopifyError) {
      logger.error("Error en Shopify", {
        requestId,
        error:
          shopifyError instanceof Error
            ? shopifyError.message
            : "Unknown error",
      });
    }
  }

  logger.info("Confirmación procesada", {
    requestId,
    orderId: updatedOrder.id,
    status: newStatus,
    shopifyUpdated: shopifyResult.success,
  });

  return json({
    success: true,
    order_id: updatedOrder.id,
    status: newStatus,
    message: `Orden ${newStatus.toLowerCase()} exitosamente`,
    shopify_updated: shopifyResult.success,
    shopify_order_name: shopifyResult.orderName || undefined,
  });
}

async function handleWebhookEvent(body: VonageWebhookEvent, requestId: string) {
  const validation = validateWebhookEvent(body);
  if (!validation.isValid) {
    return json(
      { received: false, errors: validation.errors },
      { status: 400 },
    );
  }

  logger.info("Evento Vonage recibido", {
    requestId,
    uuid: body.uuid,
    status: body.status,
    from: body.from,
    to: body.to,
  });

  // Procesar eventos específicos
  switch (body.status) {
    case "started":
    case "ringing":
      if (body.uuid && body.from) {
        await updateCallUUID(body.uuid, body.from, requestId);
      }
      break;

    case "answered":
    case "completed":
    case "failed":
    case "rejected":
    case "cancelled":
    case "timeout":
    case "unanswered":
      logger.info(`Llamada ${body.status}`, {
        requestId,
        uuid: body.uuid,
        duration: body.duration,
      });
      break;
  }

  return json({
    received: true,
    status: "processed",
    uuid: body.uuid,
    timestamp: Date.now(),
  });
}

async function handleConfigRequest(
  body: VonageConfigRequest,
  requestId: string,
  request: Request,
) {
  const { admin, session } = await authenticate.admin(request);

  const validation = validateConfigRequest(body);
  if (!validation.isValid) {
    return json({ error: validation.errors.join(", ") }, { status: 400 });
  }

  try {
    const vonageConfig = await prisma.vonageConfiguration.upsert({
      where: { shop_id: session.shop },
      update: {
        application_id: body.application_id,
        private_key: body.private_key,
        phone_number: body.phone_number,
        webhook_base_url: body.webhook_base_url,
        voice_language: body.voice_language || "es-ES",
        voice_style: body.voice_style || 0,
        call_timeout: body.call_timeout || 30,
        dtmf_timeout: body.dtmf_timeout || 15,
        updated_at: new Date(),
      },
      create: {
        shop_id: session.shop,
        application_id: body.application_id,
        private_key: body.private_key,
        phone_number: body.phone_number,
        webhook_base_url: body.webhook_base_url,
        voice_language: body.voice_language || "es-ES",
        voice_style: body.voice_style || 0,
        call_timeout: body.call_timeout || 30,
        dtmf_timeout: body.dtmf_timeout || 15,
      },
    });

    logger.info("Configuración Vonage guardada", {
      requestId,
      shopId: session.shop,
    });

    return json({ success: true, config: vonageConfig });
  } catch (error) {
    logger.error("Error guardando configuración", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "Error guardando configuración" }, { status: 500 });
  }
}

async function handleConfigGet(requestId: string, request: Request) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const vonageConfig = await prisma.vonageConfiguration.findUnique({
      where: { shop_id: session.shop },
      select: {
        id: true,
        application_id: true,
        phone_number: true,
        webhook_base_url: true,
        voice_language: true,
        voice_style: true,
        call_timeout: true,
        dtmf_timeout: true,
        is_active: true,
        created_at: true,
        last_used_at: true,
        // No incluir private_key por seguridad
      },
    });

    return json({ config: vonageConfig });
  } catch (error) {
    logger.error("Error obteniendo configuración", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "Error obteniendo configuración" }, { status: 500 });
  }
}

// ✅ FUNCIÓN PRINCIPAL
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.append("Content-Type", "application/json");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  const requestId = generateRequestId();

  try {
    logger.info("=== NUEVA REQUEST VONAGE ===", {
      requestId,
      method: request.method,
      timestamp: Date.now(),
    });

    if (request.method === "GET") {
      return await handleConfigGet(requestId, request);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405, headers });
    }

    const body = await request.json();
    const requestType = getRequestType(body);

    logger.info("Tipo de request detectado", { requestId, requestType });

    switch (requestType) {
      case "confirm":
        return await handleConfirmRequest(body, requestId, request);

      case "webhook":
        return await handleWebhookEvent(body, requestId);

      case "config":
        return await handleConfigRequest(body, requestId, request);

      default:
        return json(
          { error: "Tipo de request no reconocido" },
          { status: 400, headers },
        );
    }
  } catch (error) {
    logger.error("Error crítico en API Vonage", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return json(
      {
        success: false,
        error: "Error interno del servidor",
        requestId: requestId,
      },
      { status: 500, headers },
    );
  }
};

// Para compatibilidad con GET requests
export const loader = action;
