import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ req, token }) {
      const pathname = req.nextUrl.pathname;
      // Si hay token, el usuario está autenticado
      // La página de login está exenta por defecto
      if (pathname === "/login") {
        return true;
      }
      // Allow local preview of shared desktop modules without requiring auth bootstrapping.
      if (pathname.startsWith("/desktop/parity-preview")) {
        return true;
      }
      return !!token;
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
