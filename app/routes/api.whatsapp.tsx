// app/routes/api.whatsapp.tsx - VERSIÓN FINAL CON ESTADOS
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const phoneNumberId = url.searchParams.get('phoneNumberId');
    
    // CASO 1: Consulta desde N8N - Detección directa por phoneNumberId
    if (phoneNumberId) {
      return await detectShopByPhoneNumber(phoneNumberId);
    }
    
    // CASO 2: Dashboard admin
    return await handleAdminQuery(request);
    
  } catch (error) {
    logger.error("Error en WhatsApp loader", { error });
    return json({
      success: false,
      error: "Error interno del servidor"
    }, { status: 500 });
  }
}

// ===== FUNCIÓN PRINCIPAL DE DETECCIÓN =====
async function detectShopByPhoneNumber(phoneNumberId: string) {
  try {

    
    const whatsappNumber = await db.whatsAppNumber.findFirst({
      where: { 
        business_account_id: phoneNumberId,
        status: 'ACTIVE',
        default_shop_id: { not: null }  // Que tenga tienda asignada
      },
      include: {
        shop: {
          include: { 
            chatbot_configuration: true 
          }
        }
      }
    });

    if (!whatsappNumber || !whatsappNumber.shop) {

      
      // Debug: Mostrar números disponibles
      const availableNumbers = await db.whatsAppNumber.findMany({
        where: { status: 'ACTIVE' },
        select: { 
          phone_number: true, 
          business_account_id: true,
          assignment_status: true,
          default_shop_id: true
        }
      });
      
      return json({
        success: false,
        error: `No se encontró tienda asignada para phoneNumberId: ${phoneNumberId}`,
        debug: {
          phoneNumberId,
          availableNumbers: availableNumbers
        }
      }, { status: 404 });
    }

    const shop = whatsappNumber.shop;


    // Respuesta para N8N
    return json({
      success: true,
      shopInfo: {
        id: shop.id,
        shop_domain: shop.shop_domain,
        access_token: shop.access_token,
        subscription_plan: shop.subscription_plan
      },
      whatsappConfig: {
        businessName: shop.chatbot_configuration?.bot_name || 
                     shop.shop_domain.replace('.myshopify.com', ''),
        welcome_message: shop.chatbot_configuration?.welcome_message || 
                        `¡Hola! Bienvenido a ${shop.shop_domain.replace('.myshopify.com', '')}`,
        agentPrompt: shop.chatbot_configuration?.personality || 
                    `Eres un asistente de ventas especializado en ${shop.shop_domain}`,
        isActive: shop.chatbot_configuration?.is_active !== false,
        required_fields: shop.chatbot_configuration?.required_fields || {}
      },
      metaInfo: {
        phoneNumberId: phoneNumberId,
        whatsappNumberId: whatsappNumber.id,
        phoneNumber: whatsappNumber.phone_number,
        displayName: whatsappNumber.display_name,
        isVerified: true,
        detectionMethod: 'direct_assignment',
        confidence: 'high'
      },
      context: {
        timestamp: new Date().toISOString(),
        source: "whatsapp_business_direct",
        detectedShop: shop.shop_domain
      }
    });

  } catch (error) {
    logger.error('Error en detección WhatsApp', { error });
    return json({
      success: false,
      error: "Error al detectar tienda"
    }, { status: 500 });
  }
}

// ===== FUNCIÓN PARA DASHBOARD ADMIN =====
async function handleAdminQuery(request: Request) {
  try {
    const { session } = await authenticate.admin(request);
    
    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        chatbot_configuration: true,
        vonage_configuration: true,
        whatsAppNumbers: {
          where: { 
            assignment_status: 'ASSIGNED' 
          }
        }
      },
    });

    if (!shop) {
      return json({
        success: false,
        error: "Tienda no encontrada",
      }, { status: 404 });
    }

    const assignedNumber = shop.whatsAppNumbers?.[0] || null;

    // Estadísticas con estados
    const stats = {
      availableNumbers: await db.whatsAppNumber.count({
        where: { 
          status: 'ACTIVE',
          assignment_status: 'AVAILABLE'
        }
      }),
      assignedNumbers: await db.whatsAppNumber.count({
        where: { 
          status: 'ACTIVE',
          assignment_status: 'ASSIGNED'
        }
      }),
      reservedNumbers: await db.whatsAppNumber.count({
        where: { 
          status: 'ACTIVE',
          assignment_status: 'RESERVED'
        }
      }),
      totalInstances: await db.whatsAppNumber.count({
        where: { status: 'ACTIVE' }
      }),
      totalShops: await db.shop.count()
    };

    return json({
      success: true,
      data: {
        shop: {
          id: shop.id,
          domain: shop.shop_domain,
          subscriptionPlan: shop.subscription_plan,
        },
        assignedNumber: assignedNumber ? {
          id: assignedNumber.id,
          phoneNumber: assignedNumber.phone_number,
          displayName: assignedNumber.display_name,
          businessAccountId: assignedNumber.business_account_id,
          status: assignedNumber.status,
          assignmentStatus: assignedNumber.assignment_status,
          assignedAt: assignedNumber.assigned_at,
          countryCode: assignedNumber.country_code,
          webhookUrl: assignedNumber.webhook_url,
        } : null,
        chatbotConfig: shop.chatbot_configuration,
        vonageConfig: shop.vonage_configuration,
        statistics: stats
      },
    });

  } catch (error) {
    logger.error("Error en handleAdminQuery", { error });
    return json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}

// ===== ACTIONS PARA GESTIÓN DE NÚMEROS =====
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const body = await request.json();
    const { action } = body;

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: { chatbot_configuration: true },
    });

    if (!shop) {
      return json({
        success: false,
        error: "Tienda no encontrada",
      }, { status: 404 });
    }

    switch (action) {
      case "activate_whatsapp": {
        if (shop.subscription_plan === 'FREE') {
          return json({
            success: false,
            error: "Plan BASIC o superior requerido para WhatsApp Business",
          }, { status: 400 });
        }

        // Verificar si ya tiene número asignado
        const existingNumber = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            assignment_status: 'ASSIGNED'
          }
        });

        if (existingNumber) {
          return json({
            success: false,
            error: "Ya tienes un número WhatsApp Business asignado",
            current_number: existingNumber.phone_number
          }, { status: 400 });
        }

        // Buscar número disponible
        const availableNumber = await db.whatsAppNumber.findFirst({
          where: { 
            status: 'ACTIVE',
            assignment_status: 'AVAILABLE'
          },
          orderBy: { created_at: 'asc' }
        });

        if (!availableNumber) {
          return json({
            success: false,
            error: "No hay números WhatsApp disponibles. Contacta al administrador.",
          }, { status: 400 });
        }

        // Asignar número a la tienda
        const assignedNumber = await db.whatsAppNumber.update({
          where: { id: availableNumber.id },
          data: { 
            default_shop_id: shop.id,
            assignment_status: 'ASSIGNED',  // ✅ SÍ actualizar estado al asignar
            assigned_at: new Date(),
            updated_at: new Date()
          }
        });



        return json({
          success: true,
          data: {
            phone_number: assignedNumber.phone_number,
            display_name: assignedNumber.display_name,
            business_account_id: assignedNumber.business_account_id,
            assigned_shop: shop.shop_domain,
            message: "WhatsApp Business activado exitosamente",
          },
        });
      }

      case "deactivate_whatsapp": {
        const assignedNumber = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            assignment_status: 'ASSIGNED'
          }
        });

        if (!assignedNumber) {
          return json({
            success: false,
            error: "No tienes número WhatsApp asignado",
          }, { status: 400 });
        }

        // Liberar número
        await db.whatsAppNumber.update({
          where: { id: assignedNumber.id },
          data: { 
            default_shop_id: null,
            assignment_status: 'AVAILABLE',
            assigned_at: null,
            detection_rules: undefined,
            updated_at: new Date()
          }
        });



        return json({
          success: true,
          data: {
            message: "WhatsApp Business desactivado exitosamente",
            released_number: assignedNumber.phone_number
          },
        });
      }

      case "update_config": {
        const { bot_name, welcome_message, personality } = body;

        // Verificar que tiene número asignado
        const assignedNumber = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            assignment_status: 'ASSIGNED'
          }
        });

        if (!assignedNumber) {
          return json({
            success: false,
            error: "Primero debes activar WhatsApp Business",
          }, { status: 400 });
        }

        // Actualizar configuración del chatbot
        await db.chatbotConfiguration.upsert({
          where: { shop_id: shop.id },
          update: {
            bot_name: bot_name || undefined,
            welcome_message: welcome_message || undefined,
            personality: personality || undefined,
            updated_at: new Date()
          },
          create: {
            shop_id: shop.id,
            bot_name: bot_name || "Asistente",
            welcome_message: welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
            personality: personality || "Asistente amigable y profesional"
          }
        });

        return json({
          success: true,
          data: {
            message: "Configuración actualizada exitosamente",
          },
        });
      }

      default:
        return json({
          success: false,
          error: "Acción no válida",
        }, { status: 400 });
    }
  } catch (error) {
    logger.error("Error en WhatsApp action", { error });
    return json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}