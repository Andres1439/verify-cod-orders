// app/routes/api.chatbot-config.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  // Headers CORS para permitir acceso desde Shopify
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  console.log(`🔍 Solicitud de configuración para: ${shopDomain}`);

  // Verificar que se proporcionó el dominio de la tienda
  if (!shopDomain) {
    console.log("❌ No se proporcionó shop domain");
    return json(
      {
        bot_name: "Verify",
        welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
        is_active: true,
      },
      {
        headers: corsHeaders,
      },
    );
  }

  try {
    // Limpiar el dominio
    const cleanShopDomain = shopDomain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    console.log(`🔍 Buscando configuración para: ${cleanShopDomain}`);

    // Buscar la tienda y su configuración
    const shop = await db.shop.findUnique({
      where: {
        shop_domain: cleanShopDomain,
      },
      include: {
        chatbot_configuration: true,
      },
    });

    // Si no existe la tienda o no tiene configuración, devolver valores por defecto
    if (!shop || !shop.chatbot_configuration) {
      console.log(
        `🔄 No se encontró configuración para: ${cleanShopDomain}, usando valores por defecto`,
      );

      return json(
        {
          bot_name: "Verify",
          welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
          is_active: true,
        },
        {
          headers: corsHeaders,
        },
      );
    }

    // Devolver la configuración encontrada
    const config = shop.chatbot_configuration;

    console.log(`✅ Configuración encontrada para ${cleanShopDomain}:`, {
      bot_name: config.bot_name,
      welcome_message: config.welcome_message?.substring(0, 50) + "...",
      is_active: config.is_active,
    });

    return json(
      {
        bot_name: config.bot_name || "Verify",
        welcome_message:
          config.welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
        is_active: config.is_active ?? true,
      },
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("💥 Error al obtener configuración:", error);

    // Fallback en caso de error
    return json(
      {
        bot_name: "Verify",
        welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
        is_active: true,
      },
      {
        headers: corsHeaders,
      },
    );
  }
};

// Manejar preflight requests para CORS
export const OPTIONS = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
};
