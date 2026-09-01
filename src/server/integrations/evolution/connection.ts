import "server-only";

import { db } from "@/lib/db";

/**
 * Resolves the Evolution API instanceName for a restaurant's WhatsApp
 * connection, but only if it's actually CONNECTED — returns null otherwise
 * (disconnected, connecting, error, or no connection at all). Shared by
 * every place that sends an outbound WhatsApp message on its own
 * initiative (status/cancellation notifications, feedback requests), so
 * they all degrade the same way when the restaurant isn't connected.
 */
export async function resolveConnectedInstance(restaurantId: string): Promise<string | null> {
  const connection = await db.whatsappConnection.findUnique({ where: { restaurantId } });
  return connection && connection.status === "CONNECTED" ? connection.instanceName : null;
}
