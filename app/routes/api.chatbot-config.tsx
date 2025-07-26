// app/routes/api.chatbot-config.tsx (ACTUALIZADA)
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logger } from "../utils/logger.server";

// GET: Obtener configuración del chatbot
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization, content-type, accept, origin, x-requested-with");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop_domain");

    if (!shopDomain) {
      return json(
        { error: "shop_domain es requerido" },
        { status: 400, headers },
      );
    }

    // Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      include: { chatbot_configuration: true },
    });

    if (!shop) {
      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    // Preparar configuración con valores por defecto
    const defaultRequiredFields = {
      nombre: true,
      numero: true,
      correo: true,
      direccion: false,
      ciudad: false,
      provincia: false,
      pais: false,
    };

    console.log(`🔍 API DEBUG: Configuración encontrada para ${shopDomain}:`, {
      shop_id: shop.id,
      has_config: !!shop.chatbot_configuration,
      config_data: shop.chatbot_configuration
    });

    const chatbotConfig = shop.chatbot_configuration
      ? {
          bot_name: shop.chatbot_configuration.bot_name || "Verify",
          welcome_message:
            shop.chatbot_configuration.welcome_message ||
            "¡Hola! Estoy aquí para ayudarte.",
          personality:
            shop.chatbot_configuration.personality ||
            "Chatbot amigable que usa emojis y responde de manera casual",
          required_fields: shop.chatbot_configuration.required_fields
            ? typeof shop.chatbot_configuration.required_fields === "object"
              ? (shop.chatbot_configuration.required_fields as Record<
                  string,
                  boolean
                >)
              : defaultRequiredFields
            : defaultRequiredFields,
          is_active: shop.chatbot_configuration.is_active ?? true,
          webhook_url: shop.chatbot_configuration.webhook_url,
        }
      : {
          bot_name: "Verify",
          welcome_message: "¡Hola! Estoy aquí para ayudarte.",
          personality:
            "Chatbot amigable que usa emojis y responde de manera casual",
          required_fields: defaultRequiredFields,
          is_active: true,
          webhook_url: null,
        };

    return json(
      {
        success: true,
        shop_domain: shopDomain,
        chatbot_config: chatbotConfig,
      },
      { headers },
    );
  } catch (error) {
    logger.error("Error obteniendo configuración del chatbot", { error });
    return json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500, headers },
    );
  }
};

// POST: Actualizar configuración (para uso externo de N8N/otros servicios)
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const { shop_domain, config } = await request.json();

    if (!shop_domain || !config) {
      return json(
        { error: "shop_domain y config son requeridos" },
        { status: 400, headers },
      );
    }

    // Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain },
    });

    if (!shop) {
      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    // Validar campos requeridos si se proporcionan
    const validRequiredFields = [
      "nombre",
      "numero",
      "correo",
      "direccion",
      "ciudad",
      "provincia",
      "pais",
    ];

    let processedRequiredFields = config.required_fields;
    if (
      processedRequiredFields &&
      typeof processedRequiredFields === "object"
    ) {
      // Validar que solo contenga campos válidos
      const invalidFields = Object.keys(processedRequiredFields).filter(
        (field) => !validRequiredFields.includes(field),
      );

      if (invalidFields.length > 0) {
        return json(
          {
            error: "Campos requeridos inválidos",
            invalidFields,
            validFields: validRequiredFields,
          },
          { status: 400, headers },
        );
      }
    }

    // Actualizar configuración
    const updatedConfig = await db.chatbotConfiguration.upsert({
      where: { shop_id: shop.id },
      update: {
        bot_name: config.bot_name || undefined,
        welcome_message: config.welcome_message || undefined,
        personality: config.personality || undefined,
        required_fields: processedRequiredFields || undefined,
        is_active:
          config.is_active !== undefined ? config.is_active : undefined,
        webhook_url: config.webhook_url || undefined,
        updated_at: new Date(),
      },
      create: {
        shop_id: shop.id,
        bot_name: config.bot_name || "Verify",
        welcome_message:
          config.welcome_message || "¡Hola! Estoy aquí para ayudarte.",
        personality:
          config.personality ||
          "Chatbot amigable que usa emojis y responde de manera casual",
        required_fields: processedRequiredFields || {
          nombre: true,
          numero: true,
          correo: true,
          direccion: false,
          ciudad: false,
          provincia: false,
          pais: false,
        },
        is_active: config.is_active !== undefined ? config.is_active : true,
        webhook_url: config.webhook_url,
      },
    });

    logger.info("Configuración del chatbot actualizada", {
      shopId: shop.id,
      shop_domain,
      configId: updatedConfig.id,
    });

    return json(
      {
        success: true,
        message: "Configuración actualizada correctamente",
        shop_domain,
        config: {
          bot_name: updatedConfig.bot_name,
          welcome_message: updatedConfig.welcome_message,
          personality: updatedConfig.personality,
          required_fields: updatedConfig.required_fields,
          is_active: updatedConfig.is_active,
          webhook_url: updatedConfig.webhook_url,
        },
      },
      { headers },
    );
  } catch (error) {
    logger.error("Error actualizando configuración del chatbot", { error });
    return json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500, headers },
    );
  }
};

// OPTIONS: Para CORS
export const options = async () => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization, content-type, accept, origin, x-requested-with");
  headers.append("Access-Control-Max-Age", "86400");

  return new Response(null, { status: 200, headers });
};
