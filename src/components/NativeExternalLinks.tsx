import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { AppLauncher } from "@capacitor/app-launcher";
import { toast } from "sonner";

export default function NativeExternalLinks() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol) || url.origin === window.location.origin) return;
      event.preventDefault();
      const open = async () => {
        if (["mailto:", "tel:"].includes(url.protocol)) {
          const result = await AppLauncher.openUrl({ url: url.href });
          if (!result.completed) throw new Error("No handler");
        } else {
          if (url.protocol !== "https:") throw new Error("Insecure link");
          await Browser.open({ url: url.href });
        }
      };
      void open().catch(() => toast.error("Não foi possível abrir o link. Tente novamente ou use o contato exibido no suporte."));
    };
    document.addEventListener("click", follow);
    return () => document.removeEventListener("click", follow);
  }, []);
  return null;
}
