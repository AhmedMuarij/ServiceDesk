import type { NextAuthConfig } from "next-auth";

/**
 * The half of the auth setup that carries no database dependency, so proxy.ts
 * can decode a session and make routing decisions without pulling Prisma into
 * every request. The providers and callbacks that touch the database live in
 * auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;
      const isSignedIn = Boolean(user);

      // Signed-in users have no business on the login or register screens.
      if (pathname.startsWith("/auth/") || pathname === "/invite") {
        if (isSignedIn && (pathname === "/auth/login" || pathname === "/auth/register")) {
          const target = user?.role === "TECHNICIAN" ? "/my/jobs" : "/dashboard";
          return Response.redirect(new URL(target, request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/dashboard")) {
        if (!isSignedIn) return false;
        // Technicians get their own surface; the dashboard is not it.
        if (user?.role === "TECHNICIAN") {
          return Response.redirect(new URL("/my/jobs", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/my") || pathname === "/onboarding") {
        return isSignedIn;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
