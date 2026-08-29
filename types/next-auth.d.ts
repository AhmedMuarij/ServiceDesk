import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * The session carries the active membership, so no request has to look one up.
 * Written by the jwt callback in auth.ts and read by lib/db/scope.ts.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      membershipId: string;
      orgId: string;
      orgName: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

/**
 * `next-auth/jwt` is only `export * from "@auth/core/jwt"`, so augmenting it
 * would declare a second, unrelated JWT interface. The declaration has to land
 * on the module that actually owns the interface.
 */
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    membershipId?: string;
    orgId?: string;
    orgName?: string;
    role?: Role;
  }
}

export {};
