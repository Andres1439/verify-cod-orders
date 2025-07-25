// app/routes/api.vonage-events.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logger } from "../utils/logger.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const eventData = await request.json();
    const { status, uuid: callUuid, timestamp } = eventData;

    logger.info("Call event received", { status, callUuid, timestamp });

    if (!status || !callUuid) {
      return json({ message: "Event ignored - missing data" }, { status: 200 });
    }

    // Mapear estados de Vonage a nuestros estados
    const statusMap: Record<string, string> = {
      started: "PENDING",
      ringing: "PENDING",
      answered: "PENDING",
      completed: "COMPLETED",
      failed: "FAILED",
      timeout: "NO_ANSWER",
      unanswered: "NO_ANSWER",
      busy: "FAILED",
      cancelled: "FAILED",
      rejected: "FAILED",
    };

    const mappedStatus = statusMap[status] || "PENDING";

    // Solo actualizar para eventos finales
    const finalStates = [
      "completed",
      "failed",
      "timeout",
      "unanswered",
      "busy",
      "cancelled",
      "rejected",
    ];

    if (finalStates.includes(status)) {
      const result = await db.orderConfirmation.updateMany({
        where: {
          vonage_call_uuid: callUuid,
        },
        data: {
          call_status: mappedStatus as any,
          last_event_at: new Date(),
          updated_at: new Date(),
        },
      });

      logger.info("Call status updated", {
        callUuid,
        status: mappedStatus,
        updatedRecords: result.count
      });
    }

    return json({ message: "Event processed" }, { status: 200 });
  } catch (error) {
    logger.error("Error processing call event", { error });
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
