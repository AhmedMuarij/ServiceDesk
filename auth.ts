import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // Credentials sign-in requires JWT sessions; database sessions are not
  // supported for it. The adapter stays so OAuth can be added without a
  // migration.
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        });
        // Users created by an OAuth flow have no password hash.
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user?.id) token.id = user.id;

      // Resolve the active membership once at sign-in, and again whenever a
      // server action calls update() — accepting an invite, changing a role.
      if (token.id && (!token.membershipId || trigger === "update")) {
        const membership = await prisma.membership.findFirst({
          where: { userId: token.id, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            organizationId: true,
            organization: { select: { name: true } },
          },
        });

        if (membership) {
          token.membershipId = membership.id;
          token.orgId = membership.organizationId;
          token.orgName = membership.organization.name;
          token.role = membership.role;
        } else {
          delete token.membershipId;
          delete token.orgId;
          delete token.orgName;
          delete token.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.membershipId) session.user.membershipId = token.membershipId;
      if (token.orgId) session.user.orgId = token.orgId;
      if (token.orgName) session.user.orgName = token.orgName;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
