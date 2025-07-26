// app/routes/api.vonage-answer.tsx - VERSIÓN CORREGIDA
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// 🔧 FUNCIÓN HELPER PARA MANEJAR WEBHOOKS
async function handleAnswerWebhook(request: Request) {
  const url = new URL(request.url);
  
  let orderId: string | null = null;
  let callUuid: string | null = null;
  let fromNumber: string | null = null;
  
  if (request.method === "GET") {
    // GET request - parámetros en query string
    orderId = url.searchParams.get("orderId");
    callUuid = url.searchParams.get("uuid") || url.searchParams.get("conversation_uuid") || "unknown";
    fromNumber = url.searchParams.get("from");
    

  } else {
    // POST request - parámetros en body
    try {
      const body = await request.json();
      orderId = body.orderId || url.searchParams.get("orderId");
      callUuid = body.uuid || body.conversation_uuid || "unknown";
      fromNumber = body.from;
      

    } catch (error) {
      // Si no hay JSON, intentar form data
      const formData = await request.formData();
      orderId = formData.get("orderId")?.toString() || url.searchParams.get("orderId");
      callUuid = formData.get("uuid")?.toString() || formData.get("conversation_uuid")?.toString() || "unknown";
      fromNumber = formData.get("from")?.toString() || null;
      

    }
  }

  if (!orderId) {

    return json({ error: "Order ID is required" }, { status: 400 });
  }

  // Validar si es UUID válido (datos reales) o test
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValidUuid = uuidRegex.test(orderId);

  let orderData;

  if (isValidUuid) {
    // Datos reales - buscar en BD

    orderData = await db.orderConfirmation.findFirst({
      where: {
        id: orderId,
        status: "PENDING_CALL",
      },
      include: {
        shop: true,
      },
    });

    if (!orderData) {

      return json({ error: "Order not found" }, { status: 404 });
    }
    

  } else {
    // Datos de test

    orderData = {
      id: orderId,
      customer_name: "Cliente Test",
      order_total: "299.99",
      shop_currency: "PEN",
    };
  }

  // Generar mensaje personalizado con información completa de la orden
  const customerName = orderData.customer_name || "Cliente";
  const orderTotal = parseFloat(String(orderData.order_total || "0")).toFixed(2);
  const currency = orderData.shop_currency || "PEN";
  
  // Procesar información de productos
  let productsText = "";
  if (orderData.order_items) {
    try {
      const items = typeof orderData.order_items === 'string' 
        ? JSON.parse(orderData.order_items) 
        : orderData.order_items;
      
      if (Array.isArray(items) && items.length > 0) {
        const productNames = items.map(item => item.title || item.name).filter(Boolean);
        if (productNames.length > 0) {
          productsText = productNames.length === 1 
            ? productNames[0]
            : `${productNames.slice(0, -1).join(", ")} y ${productNames[productNames.length - 1]}`;
        }
      }
    } catch (error) {

    }
  }
  
  // Procesar dirección de envío
  let addressText = "";
  if (orderData.shipping_address) {
    try {
      const address = typeof orderData.shipping_address === 'string'
        ? JSON.parse(orderData.shipping_address)
        : orderData.shipping_address;
      
      const addressParts = [];
      if (address.address1) addressParts.push(address.address1);
      if (address.city) addressParts.push(address.city);
      if (address.province) addressParts.push(address.province);
      
      if (addressParts.length > 0) {
        addressText = addressParts.join(", ");
      }
    } catch (error) {

    }
  }

  // Construir mensaje personalizado
  let talkText = `Hola ${customerName}`;
  
  if (productsText) {
    talkText += `, tienes un pedido de ${productsText}`;
  } else {
    talkText += ", tienes un pedido pendiente";
  }
  
  if (parseFloat(orderTotal) > 0) {
    talkText += ` por ${orderTotal} ${currency}`;
  }
  
  if (addressText) {
    talkText += ` para entregar en ${addressText}`;
  }
  
  talkText += ". Para confirmar presiona 1, para cancelar presiona 2.";
  


  // Detectar si es fallback
  const isFallback = url.searchParams.get("fallback") === "true";

  // NCCO ultra-simplificado para evitar drops de 3 segundos
  const ncco = [
    {
      action: "talk",
      text: talkText,
      language: "es-ES"
    },
    {
      action: "input",
      eventUrl: [`${process.env.APP_URL?.replace(/\/$/, '')}/api/vonage-dtmf?call_uuid=${callUuid}&order_id=${orderId}`],
      timeOut: 5,
      maxDigits: 1
    }
  ];
  

  
  // Si es fallback, usar mensaje más simple
  if (isFallback) {

    return json([
      {
        action: "talk",
        text: "Lo sentimos, hubo un problema técnico. Te contactaremos nuevamente para confirmar tu pedido.",
        language: "es-ES",
        style: 0
      }
    ]);
  }


  
  // Asegurar headers correctos para Vonage
  return json(ncco, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

// 📞 GET - Webhook para respuesta (método original)
export async function loader({ request }: LoaderFunctionArgs) {
  
  try {
    const result = await handleAnswerWebhook(request);

    return result;
  } catch (error) {

    return json([
      {
        action: "talk",
        text: "Hola, confirma tu pedido. Presiona 1 para SI, 2 para NO.",
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

// 📞 POST - Webhook para respuesta (método adicional)
export async function action({ request }: ActionFunctionArgs) {
  
  try {
    const result = await handleAnswerWebhook(request);

    return result;
  } catch (error) {

    return json([
      {
        action: "talk",
        text: "Hola, confirma tu pedido. Presiona 1 para SI, 2 para NO.",
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