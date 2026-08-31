import "server-only";

import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma";
import { normalizeOpeningHours, type OpeningHours } from "@/lib/opening-hours";

// Re-exported as types only — client components must import the runtime
// WEEKDAYS/normalizeOpeningHours values from "@/lib/opening-hours"
// directly (not from here), since this file is guarded by "server-only"
// and any client import of it — even for an unrelated named export —
// fails the build.
export type { Weekday, DayHours, OpeningHours } from "@/lib/opening-hours";

export type RestaurantSettings = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  pixKey: string | null;
  openingHours: OpeningHours;
};

export async function getRestaurantSettings(restaurantId: string): Promise<RestaurantSettings> {
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  return {
    id: restaurant.id,
    name: restaurant.name,
    phone: restaurant.phone,
    address: restaurant.address,
    pixKey: restaurant.pixKey,
    openingHours: normalizeOpeningHours(restaurant.openingHours),
  };
}

export type UserListItem = { id: string; name: string; email: string; role: Role; createdAt: Date };

export async function listUsers(restaurantId: string): Promise<UserListItem[]> {
  const users = await db.user.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return users;
}
