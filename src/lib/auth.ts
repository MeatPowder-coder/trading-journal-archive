import { getServerSession } from 'next-auth';
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === 'production';

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    secret: process.env.NEXTAUTH_SECRET,
    // Prevent OAuth state cookies from being marked Secure during local HTTP dev.
    useSecureCookies: isProduction,
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        }),
    ],
    session: { strategy: 'jwt' },
    callbacks: {
        async signIn({ user }) {
            const allowedEmail = process.env.ALLOWED_EMAIL;
            if (allowedEmail) {
                if (!user.email) return false;
                if (user.email.toLowerCase().trim() !== allowedEmail.toLowerCase().trim()) return false;
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token['https://hasura.io/jwt/claims'] = {
                    'x-hasura-allowed-roles': ['user'],
                    'x-hasura-default-role': 'user',
                    'x-hasura-user-id': token.sub,
                };
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.sub;
                const encodedToken = jwt.sign(token, process.env.NEXTAUTH_SECRET!, { algorithm: 'HS256' });
                (session as any).accessToken = encodedToken;
            }
            return session;
        },
    },
};

export async function getAuthSession() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    return {
        userId: (session.user as any).id as string,
        email: session.user.email!,
        name: session.user.name!,
    };
}
