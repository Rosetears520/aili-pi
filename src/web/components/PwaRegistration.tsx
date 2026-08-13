"use client";
import { useEffect } from "react";
/** Retains Pi Web's production-only, same-origin PWA registration. */
export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_VERSION ?? "dev")}`, { scope: "/", updateViaCache: "none" }).catch(() => undefined); };
    if (document.readyState === "complete") register(); else { window.addEventListener("load", register, { once: true }); return () => window.removeEventListener("load", register); }
  }, []);
  return null;
}
