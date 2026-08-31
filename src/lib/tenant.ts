import "server-only";

import { auth } from "@/lib/auth";

/**
 * Resolves the current session and returns the fields every domain query
 * needs to stay scoped to one restaurant. Throws if there is no session —
 * callers run behind the (app) proxy guard, so this should only happen if
 * a Server Action is invoked directly without a valid session.
 */
export async function getTenant() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado.");
  }
  return {
    userId: session.user.id,
    restaurantId: session.user.restaurantId,
    role: session.user.role,
    name: session.user.name ?? "",
  };
}
