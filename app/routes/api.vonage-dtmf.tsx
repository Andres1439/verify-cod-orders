// app/routes/api.vonage-dtmf.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const callUuid = url.searchParams.get("call_uuid");
    const orderId = url.searchParams.get("order_id");

    const dtmfData = await request.json();
    const { dtmf } = dtmfData;

    console.log("🔢 DTMF received:", { dtmf, callUuid, orderId });

    if (!callUuid) {
      return json({ error: "Call UUID is required" }, { status: 400 });
    }

    // Procesar respuesta DTMF
    let orderStatus = "";
    let responseMessage = "";

    switch (dtmf) {
      case "1":
        orderStatus = "CONFIRMED";
        responseMessage = "Perfecto, tu pedido ha sido confirmado. Gracias.";
        break;
      case "2":
        orderStatus = "DECLINED";
        responseMessage = "Entendido, tu pedido ha sido cancelado.";
        break;
      default:
        orderStatus = "NO_ANSWER";
        responseMessage =
          "No pudimos procesar tu respuesta. Te contactaremos nuevamente.";
        break;
    }

    // Actualizar base de datos
    const updateData: any = {
      dtmf_response: dtmf,
      updated_at: new Date(),
    };

    if (orderStatus === "CONFIRMED") {
      updateData.status = "CONFIRMED";
      updateData.confirmed_at = new Date();
    } else if (orderStatus === "DECLINED") {
      updateData.status = "DECLINED";
      updateData.declined_at = new Date();
    } else {
      updateData.status = "NO_ANSWER";
    }

    await db.orderConfirmation.updateMany({
      where: {
        vonage_call_uuid: callUuid,
      },
      data: updateData,
    });

    console.log("✅ Order status updated:", { callUuid, orderStatus, dtmf });

    // Responder con NCCO final
    const responseNCCO = [
      {
        action: "talk",
        text: responseMessage,
        language: "es-ES",
      },
    ];

    return json(responseNCCO);
  } catch (error) {
    console.error("❌ Error processing DTMF:", error);
    return json([
      {
        action: "talk",
        text: "Lo sentimos, ocurrió un error procesando tu respuesta.",
        language: "es-ES",
      },
    ]);
  }
}
