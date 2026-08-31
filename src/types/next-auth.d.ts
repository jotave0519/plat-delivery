import { DefaultSession } from "next-auth";

// Augment the built-in session/user types with the tenant-scoping fields we
// attach in the jwt/session callbacks (src/lib/auth.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      restaurantId: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    restaurantId: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    restaurantId: string;
    role: string;
  }
}
