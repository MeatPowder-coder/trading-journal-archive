import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ req, token }) {
      // Si hay token, el usuario está autenticado
      // La página de login está exenta por defecto
      if (req.nextUrl.pathname === "/login") {
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
