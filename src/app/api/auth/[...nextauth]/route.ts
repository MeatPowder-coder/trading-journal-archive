import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      const allowedEmail = process.env.ALLOWED_EMAIL;
      console.log("SignIn Attempt:", {
        userEmail: user.email,
        allowedEmail,
      });

      if (allowedEmail) {
        if (!user.email) return false;

        const normalizedUserEmail = user.email.toLowerCase().trim();
        const normalizedAllowedEmail = allowedEmail.toLowerCase().trim();

        if (normalizedUserEmail !== normalizedAllowedEmail) {
          console.log("Email mismatch:", {
            normalizedUserEmail,
            normalizedAllowedEmail,
          });
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token["https://hasura.io/jwt/claims"] = {
          "x-hasura-allowed-roles": ["user"],
          "x-hasura-default-role": "user",
          "x-hasura-user-id": token.sub,
        };
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        // Sign the token again to send to client
        const encodedToken = jwt.sign(token, process.env.NEXTAUTH_SECRET!, {
          algorithm: "HS256",
        });
        (session as any).accessToken = encodedToken;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
