"use client";

import { useEffect } from "react";

export function OpenDesktopButton({ deepLinkUrl }: { deepLinkUrl: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = deepLinkUrl;
    }, 700);

    return () => window.clearTimeout(timer);
  }, [deepLinkUrl]);

  return (
    <div className="mt-5">
      <a
        href={deepLinkUrl}
        className="inline-flex items-center rounded-md border border-sky-500 bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        Abrir Trading Journal Desktop
      </a>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        Si tu navegador pregunta si quieres abrir la app, presiona <b>Abrir</b>.
      </p>
    </div>
  );
}
