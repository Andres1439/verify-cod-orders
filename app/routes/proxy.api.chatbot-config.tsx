import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("--- [API Proxy Chatbot] Petición recibida ---");

  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");

    if (!shopDomain) {
      return json(
        { error: "El parámetro 'shop' es requerido." },
        { status: 400, headers },
      );
    }

    const shopWithConfig = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      include: { chatbot_configuration: true }, // ✅ Nombre corregido
    });

    const configuration = shopWithConfig?.chatbot_configuration; // ✅ Nombre corregido

    if (!configuration) {
      // Devolver configuración por defecto si no existe
      return json(
        {
          bot_name: "Verify",
          welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
          is_active: true,
        },
        { headers },
      );
    }

    console.log(`[API Proxy] Configuración encontrada para ${shopDomain}`);
    return json(configuration, { headers });
  } catch (error) {
    console.error("[API Proxy] Error:", error);
    return json(
      {
        bot_name: "Verify",
        welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
        is_active: true, // ✅ Cambiar a true
      },
      { status: 200, headers }, // ✅ Status 200 en lugar de 500
    );
    return json(
      { error: "Error interno del servidor." },
      { status: 500, headers },
    );
  }
};
