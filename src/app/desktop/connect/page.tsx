import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { approveDesktopPairingCode } from '@/lib/desktop-pairing';

interface DesktopConnectPageProps {
  searchParams?: {
    pairingCode?: string | string[];
  };
}

function getQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function buildCallbackUrl(pairingCode: string) {
  return `/desktop/connect?pairingCode=${encodeURIComponent(pairingCode)}`;
}

export default async function DesktopConnectPage({ searchParams }: DesktopConnectPageProps) {
  const pairingCode = getQueryValue(searchParams?.pairingCode).trim().toUpperCase();

  if (!pairingCode) {
    return (
      <main className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex items-center justify-center p-6">
        <section className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold">Desktop Pairing</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Falta el parámetro <code>pairingCode</code> en la URL.
          </p>
          <p className="mt-4 text-sm">
            Vuelve a tu app de escritorio, presiona <b>Start Pairing</b> y abre el enlace de nuevo.
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
    const callbackUrl = buildCallbackUrl(pairingCode);
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const result = await approveDesktopPairingCode({
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
  const ok = result.status === 200 && payload.success === true;

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold">Desktop Pairing</h1>

        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Código: <code>{pairingCode}</code>
        </p>

        {ok ? (
          <>
            <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              Dispositivo aprobado correctamente.
            </p>
            <p className="mt-4 text-sm">
              Vuelve a la app de escritorio y presiona <b>Complete Pairing</b>.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {payload.error || 'No se pudo aprobar el dispositivo.'}
            </p>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Estado HTTP: {result.status}
            </p>
            <p className="mt-3 text-sm">
              Si el código expiró, vuelve a la app de escritorio y genera uno nuevo.
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
