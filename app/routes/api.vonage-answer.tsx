// app/routes/api.vonage-answer.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    const callUuid = url.searchParams.get("uuid") || "unknown";

    console.log("🎤 Answer webhook called:", { orderId, callUuid });

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // Validar si es UUID válido (datos reales) o test
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
        order_total: "1499.90",
        shop_currency: "PEN",
      };
    }

    // Generar NCCO
    const customerName = orderData.customer_name || "Cliente";
    const orderTotal = parseFloat(String(orderData.order_total || "0")).toFixed(2);
    const currency = orderData.shop_currency || "PEN";

    let talkText =
      "Hola, te llamamos para confirmar tu pedido. Presiona 1 para confirmar, o 2 para cancelar.";

    if (parseFloat(orderTotal) > 0) {
      talkText = `Hola ${customerName}, te llamamos para confirmar tu pedido por ${orderTotal} ${currency}. Presiona 1 para confirmar, o 2 para cancelar.`;
    }

    const ncco = [
      {
        action: "talk",
        text: talkText,
        language: "es-ES",
      },
      {
        action: "input",
        eventUrl: [
          `${process.env.APP_URL}/api/vonage-dtmf?call_uuid=${callUuid}&order_id=${orderId}`,
        ],
        timeOut: 15,
        maxDigits: 1,
        submitOnHash: false,
      },
    ];

    console.log("✅ NCCO generated:", JSON.stringify(ncco, null, 2));

    return json(ncco);
  } catch (error) {
    console.error("❌ Error in answer webhook:", error);
    return json([
      {
        action: "talk",
        text: "Lo sentimos, ocurrió un error. Por favor intenta más tarde.",
        language: "es-ES",
      },
    ]);
  }
}
