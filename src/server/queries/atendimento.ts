import "server-only";

import { db } from "@/lib/db";

export function getWhatsappConnection(restaurantId: string) {
  return db.whatsappConnection.findUnique({ where: { restaurantId } });
}
