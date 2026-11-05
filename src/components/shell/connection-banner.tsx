"use client";

import { WifiIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

/** How long «Conexión recuperada» stays once the network is back. */
export const CONNECTION_BACK_MS = 3000;

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the browser has a network; on the server, as if it had. */
function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Whether the network came back in the last 3 s. */
function useJustBack() {
  const [back, setBack] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      clearTimeout(timer);
      setBack(true);
      timer = setTimeout(() => setBack(false), CONNECTION_BACK_MS);
    };
    const onOffline = () => {
      clearTimeout(timer);
      setBack(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return back;
}

/**
 * The band under the top bar while the network is down (Errors board, section 5): amber, not red,
 * since nobody is to blame and it mends itself. When the network comes back it says so for 3 s,
 * then goes. The status region is always there, so both are heard.
 */
export function ConnectionBanner() {
  const t = useTranslations("Connection");
  const online = useOnline();
  const back = useJustBack();

  return (
    <div role="status">
      {!online && (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-status-warn/40 tint-warn px-5 py-2 text-sm">
          <WifiOffIcon aria-hidden className="size-4 shrink-0 text-status-warn-text" />
          <span className="font-semibold text-status-warn-text">{t("offline")}</span>{" "}
          <span className="text-foreground">{t("offlineDetail")}</span>
        </p>
      )}
      {online && back && (
        <p className="flex items-center gap-2.5 border-b border-status-ok/40 tint-ok px-5 py-2 text-sm">
          <WifiIcon aria-hidden className="size-4 shrink-0 text-status-ok-text" />
          <span className="font-semibold text-status-ok-text">{t("back")}</span>
        </p>
      )}
    </div>
  );
}
