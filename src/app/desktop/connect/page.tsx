import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { approveDesktopPairingCode } from "@/lib/desktop-pairing";
import { OpenDesktopButton } from "./open-desktop-button";

interface DesktopConnectPageProps {
  searchParams?: {
    pairingId?: string | string[];
    pairingCode?: string | string[];
  };
}

function getQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function buildCallbackUrl(pairingId: string, pairingCode: string) {
  const params = new URLSearchParams();
  if (pairingId) params.set("pairingId", pairingId);
  if (pairingCode) params.set("pairingCode", pairingCode);
  return `/desktop/connect?${params.toString()}`;
}

function buildAppDeepLink(pairingId: string) {
  return `trading-journal://auth-complete?pairingId=${encodeURIComponent(pairingId)}`;
}

export default async function DesktopConnectPage({ searchParams }: DesktopConnectPageProps) {
  const pairingId = getQueryValue(searchParams?.pairingId).trim();
  const pairingCode = getQueryValue(searchParams?.pairingCode).trim().toUpperCase();
  const hasIdentity = Boolean(pairingId || pairingCode);

  if (!hasIdentity) {
    return (
      <main className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex items-center justify-center p-6">
        <section className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold">Conectar Desktop</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Falta el identificador de sesión para vincular el dispositivo.
          </p>
          <p className="mt-4 text-sm">
            Regresa a la app de escritorio y presiona <b>Iniciar sesión con Google</b> otra vez.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Ir al Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const auth = await getAuthSession();
  if (!auth) {
    const callbackUrl = buildCallbackUrl(pairingId, pairingCode);
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const result = await approveDesktopPairingCode({
    pairingId,
    pairingCode,
    userId: auth.userId,
    userEmail: auth.email || null,
    userName: auth.name || null,
  });

  const payload = result.payload as {
    success?: boolean;
    error?: string;
    pairingId?: string;
    status?: string;
  };
  const approvedPairingId = payload.pairingId || pairingId;
  const appDeepLink = approvedPairingId ? buildAppDeepLink(approvedPairingId) : "";
  const ok = result.status === 200 && payload.success === true && Boolean(appDeepLink);

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold">Conectar Desktop</h1>

        {ok ? (
          <>
            <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              Inicio de sesión aprobado. Vamos a volver a la app.
            </p>
            <OpenDesktopButton deepLinkUrl={appDeepLink} />
          </>
        ) : (
          <>
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {payload.error || "No se pudo completar el login de escritorio."}
            </p>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Si el intento expiró, vuelve a la app y reintenta el login.
            </p>
          </>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Abrir Trading Journal Web
          </Link>
        </div>
      </section>
    </main>
  );
}
