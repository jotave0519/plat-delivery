import "server-only";

import { db } from "@/lib/db";

export type RecognizedCustomer = { name: string; phone: string } | null;

/**
 * Looks up an existing Customer by phone digits within a tenant — the
 * customer-recognition step shared by every inbound channel (WhatsApp,
 * phone-ordering, and the generic-attendance phone agent), so a returning
 * caller/contact is never asked their name twice. Not food/order specific —
 * lives here rather than inside atendimento-ia-conversa.ts so agents
 * outside the ordering domain (AGENTS.md: each new agent in its own
 * namespace) can reuse it without depending on that file.
 */
export async function findExistingCustomerByPhone(restaurantId: string, phoneNumber: string): Promise<RecognizedCustomer> {
  const existingCustomer = await db.customer.findFirst({
    where: { restaurantId, phone: phoneNumber.replace(/\D/g, "") },
    select: { name: true, phone: true },
  });
  // Non-null assertion is safe here: the query only matches a Customer whose
  // `phone` equals the (non-empty, non-null) digits we searched for.
  return existingCustomer ? { name: existingCustomer.name, phone: existingCustomer.phone! } : null;
}
