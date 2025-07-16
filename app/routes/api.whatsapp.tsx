// app/routes/api.whatsapp.tsx - VERSIÓN ACTUALIZADA CON INFORMACIÓN DE TIENDA
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    
    // DETECTAR DIFERENTES TIPOS DE CONSULTA
    const from = url.searchParams.get('from');
    const message = url.searchParams.get('message');
    const phoneNumberId = url.searchParams.get('phoneNumberId');
    const messageText = url.searchParams.get('messageText'); // NUEVO para links únicos
    
    // ===== MODO N8N (varios formatos) =====
    if (from || message || phoneNumberId) {
      return await handleN8NQuery(url);
    }
    
    // ===== MODO ADMIN (dashboard de tienda) =====
    return await handleAdminQuery(request);
    
  } catch (error) {
    console.error("Error en loader WhatsApp:", error);
    return json({
      success: false,
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, { status: 500 });
  }
}

// ===== FUNCIÓN PARA N8N (MEJORADA CON DETECCIÓN DE TIENDA) =====
async function handleN8NQuery(url: URL) {
  try {
    const phoneNumberId = url.searchParams.get('phoneNumberId');
    const messageText = url.searchParams.get('messageText');
    const from = url.searchParams.get('from');
    const message = url.searchParams.get('message');
    
    // CASO 1: Consulta con phoneNumberId (desde N8N workflow)
    if (phoneNumberId) {
      console.log(`[N8N] Buscando phoneNumberId: ${phoneNumberId}`);
      console.log(`[N8N] Texto del mensaje: ${messageText}`);
      
      let detectedShop = null;
      let detectionMethod = "default";
      let whatsappNumber = null;

      // 1. DETECCIÓN POR LINK ÚNICO (si viene código en el mensaje)
      if (messageText) {
        const codeMatch = messageText.match(/start_([a-z0-9_-]+)/i);
        
        if (codeMatch) {
          const shopCode = codeMatch[1].toLowerCase();
          console.log(`[N8N] Código de tienda detectado: ${shopCode}`);
          
          // Buscar tienda por nombre en el dominio
          detectedShop = await db.shop.findFirst({
            where: { 
              shop_domain: { contains: shopCode }
            },
            include: { chatbot_configuration: true }
          });
          
          if (detectedShop) {
            detectionMethod = "unique_link";
            console.log(`[N8N] Tienda detectada por link único: ${detectedShop.shop_domain}`);
            
            // Buscar cualquier número activo para este caso
            whatsappNumber = await db.whatsAppNumber.findFirst({
              where: { 
                business_account_id: phoneNumberId,
                status: 'ACTIVE'
              }
            });
          }
        }
      }

      // 2. DETECCIÓN POR NÚMERO ASIGNADO (método principal)
      if (!detectedShop) {
        console.log(`[N8N] Buscando por asignación de número`);
        
        // Buscar número WhatsApp con tienda asignada
        whatsappNumber = await db.whatsAppNumber.findFirst({
          where: { 
            business_account_id: phoneNumberId,
            status: 'ACTIVE'
          },
          include: {
            // JOIN con la tienda asignada
            shop: {
              include: { chatbot_configuration: true }
            }
          }
        });

        if (!whatsappNumber) {
          const allNumbers = await db.whatsAppNumber.findMany({
            where: { status: 'ACTIVE' },
            select: { phone_number: true, business_account_id: true, id: true }
          });
          
          return json({
            success: false,
            error: `No se encontró número WhatsApp para phoneNumberId: ${phoneNumberId}`,
            debug: { phoneNumberId, availableNumbers: allNumbers }
          }, { status: 404 });
        }

        // Usar la tienda asignada al número
        if (whatsappNumber.default_shop_id && whatsappNumber.shop) {
          detectedShop = whatsappNumber.shop;
          detectionMethod = "assigned_shop";
          console.log(`[N8N] Tienda detectada por asignación: ${detectedShop.shop_domain}`);
        }
      }

      // 3. FALLBACK: Primera tienda disponible
      if (!detectedShop) {
        console.log(`[N8N] Usando tienda por defecto`);
        detectedShop = await db.shop.findFirst({
          where: { subscription_plan: { not: 'FREE' }},
          include: { chatbot_configuration: true },
          orderBy: { created_at: 'asc' }
        });
        detectionMethod = "fallback";
      }

      if (!detectedShop) {
        return json({
          success: false,
          error: "No se pudo detectar tienda"
        }, { status: 404 });
      }

      console.log(`[N8N] Tienda final: ${detectedShop.shop_domain} (método: ${detectionMethod})`);

      // 4. RESPUESTA PARA N8N
      return json({
        success: true,
        detection: {
          method: detectionMethod,
          confidence: detectionMethod === "unique_link" ? "high" : 
                     detectionMethod === "assigned_shop" ? "high" : "low",
          messageText: messageText,
          detectedCode: messageText?.match(/start_([a-z0-9_-]+)/i)?.[0] || null
        },
        shopInfo: {
          id: detectedShop.id,
          shop_domain: detectedShop.shop_domain,
          access_token: detectedShop.access_token,
          subscription_plan: detectedShop.subscription_plan
        },
        whatsappConfig: {
          businessName: detectedShop.chatbot_configuration?.bot_name || 
                       detectedShop.shop_domain.replace('.myshopify.com', ''),
          welcome_message: detectedShop.chatbot_configuration?.welcome_message || 
                          `¡Hola! Bienvenido a ${detectedShop.shop_domain.replace('.myshopify.com', '')}`,
          agentPrompt: detectedShop.chatbot_configuration?.personality || 
                      `Eres un asistente de ventas especializado en ${detectedShop.shop_domain}`,
          isActive: detectedShop.chatbot_configuration?.is_active !== false
        },
        metaInfo: {
          phoneNumberId: phoneNumberId,
          isVerified: true,
          businessAccountId: whatsappNumber?.business_account_id || whatsappNumber?.phone_number,
          assignedShop: detectionMethod === "assigned_shop"
        },
        context: {
          timestamp: new Date().toISOString(),
          source: "whatsapp_business_enhanced",
          detectedShop: detectedShop.shop_domain,
          detectionMethod: detectionMethod
        }
      });
    }
    
    // CASO 2: Consulta simple con 'from' o 'message' (lógica original)
    else if (from || message) {
      console.log('[N8N] Consulta simple con from/message');
      
      const whatsappNumber = await db.whatsAppNumber.findFirst({
        where: { 
          status: 'ACTIVE',
          default_shop_id: { not: null }
        }
      });

      if (!whatsappNumber) {
        return json({
          success: false,
          error: "No hay número WhatsApp disponible"
        }, { status: 404 });
      }

      return json({
        success: true,
        data: {
          whatsapp_number: whatsappNumber.phone_number,
          webhook_url: whatsappNumber.webhook_url
        }
      });
    }
    
    else {
      return json({
        success: false,
        error: "Parámetros no válidos para consulta N8N"
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[N8N] Error en handleN8NQuery:', error);
    return json({
      success: false,
      error: "Error al procesar consulta N8N",
      details: error instanceof Error ? error.message : "Error desconocido"
    }, { status: 500 });
  }
}

// ===== FUNCIÓN PARA DASHBOARD ADMIN (MEJORADA) =====
async function handleAdminQuery(request: Request) {
  const { session } = await authenticate.admin(request);
  
  // Buscar la tienda
  const shop = await db.shop.findUnique({
    where: { shop_domain: session.shop },
    include: {
      chatbot_configuration: true,
      vonage_configuration: true,
    },
  });

  if (!shop) {
    return json({
      success: false,
      error: "Tienda no encontrada",
    }, { status: 404 });
  }

  // Verificar si la tienda tiene una instancia WhatsApp asignada
  const assignedWhatsAppNumber = await db.whatsAppNumber.findFirst({
    where: { 
      default_shop_id: shop.id,
      status: 'ACTIVE'
    }
  });

  // NUEVA: Obtener información de qué tienda está asignada a cada número
  const allAssignedNumbers = await db.whatsAppNumber.findMany({
    where: { 
      status: 'ACTIVE',
      default_shop_id: { not: null }
    },
    include: {
      shop: {
        select: {
          shop_domain: true,
          subscription_plan: true
        }
      }
    },
    orderBy: { updated_at: 'desc' }
  });

  // Obtener estadísticas
  const availableNumbers = await db.whatsAppNumber.count({
    where: { 
      status: 'ACTIVE',
      default_shop_id: null 
    }
  });

  const totalAssigned = await db.whatsAppNumber.count({
    where: { 
      status: 'ACTIVE',
      default_shop_id: { not: null }
    }
  });

  const totalInstances = await db.whatsAppNumber.count({
    where: { status: 'ACTIVE' }
  });

  return json({
    success: true,
    data: {
      shop: {
        id: shop.id,
        domain: shop.shop_domain,
        subscriptionPlan: shop.subscription_plan,
      },
      assignedNumber: assignedWhatsAppNumber ? {
        id: assignedWhatsAppNumber.id,
        phoneNumber: assignedWhatsAppNumber.phone_number,
        displayName: assignedWhatsAppNumber.display_name,
        status: assignedWhatsAppNumber.status,
        assignedAt: assignedWhatsAppNumber.updated_at,
        monthlyCost: 0, // Incluido en el plan
        countryCode: assignedWhatsAppNumber.country_code,
        numberType: "business",
        capabilities: { text: true, media: true, voice: true },
        webhookUrl: assignedWhatsAppNumber.webhook_url,
        // NUEVA: Información de la tienda asignada
        assignedShop: {
          id: shop.id,
          domain: shop.shop_domain,
          name: shop.chatbot_configuration?.bot_name || shop.shop_domain.replace('.myshopify.com', ''),
          plan: shop.subscription_plan
        }
      } : null,
      chatbotConfig: shop.chatbot_configuration,
      vonageConfig: shop.vonage_configuration,
      statistics: {
        availableNumbers,
        totalAssigned,
        totalInstances,
        totalShops: await db.shop.count(),
      },
      // NUEVA: Lista de todas las asignaciones (para admin)
      allAssignments: allAssignedNumbers.map(num => ({
        phoneNumber: num.phone_number,
        shopDomain: num.shop?.shop_domain || 'Sin tienda',
        shopPlan: num.shop?.subscription_plan || 'N/A',
        assignedAt: num.updated_at
      }))
    },
  });
}

// ===== ACTIONS (SIN CAMBIOS) =====
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
            error: "Plan BASIC o superior requerido",
          }, { status: 400 });
        }

        const existingNumber = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            status: 'ACTIVE'
          }
        });

        if (existingNumber) {
          return json({
            success: false,
            error: "Ya tienes un número WhatsApp asignado",
          }, { status: 400 });
        }

        const availableInstance = await db.whatsAppNumber.findFirst({
          where: { 
            status: 'ACTIVE',
            default_shop_id: null
          },
          orderBy: { created_at: 'asc' }
        });

        if (!availableInstance) {
          return json({
            success: false,
            error: "No hay números WhatsApp disponibles en este momento",
          }, { status: 400 });
        }

        // Asignar la instancia a esta tienda
        const assignedInstance = await db.whatsAppNumber.update({
          where: { id: availableInstance.id },
          data: { 
            default_shop_id: shop.id,
            updated_at: new Date()
          }
        });

        return json({
          success: true,
          data: {
            phone_number: assignedInstance.phone_number,
            assigned_shop: shop.shop_domain,
            message: "WhatsApp Business activado exitosamente",
          },
        });
      }

      case "deactivate_whatsapp": {
        const assignedInstance = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            status: 'ACTIVE'
          }
        });

        if (!assignedInstance) {
          return json({
            success: false,
            error: "No tienes número WhatsApp asignado",
          }, { status: 400 });
        }

        await db.whatsAppNumber.update({
          where: { id: assignedInstance.id },
          data: { 
            default_shop_id: null,
            detection_rules: {},
            updated_at: new Date()
          }
        });

        return json({
          success: true,
          data: {
            message: "WhatsApp Business desactivado exitosamente",
            released_number: assignedInstance.phone_number
          },
        });
      }

      case "update_keywords": {
        const { keywords } = body;

        const assignedInstance = await db.whatsAppNumber.findFirst({
          where: { 
            default_shop_id: shop.id,
            status: 'ACTIVE'
          }
        });

        if (!assignedInstance) {
          return json({
            success: false,
            error: "No tienes número WhatsApp asignado",
          }, { status: 400 });
        }

        const updatedRules = {
          shop_keywords: keywords || []
        };

        await db.whatsAppNumber.update({
          where: { id: assignedInstance.id },
          data: { 
            detection_rules: updatedRules,
            updated_at: new Date()
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
    console.error("Error en action WhatsApp:", error);
    return json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}