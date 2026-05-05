import { useState } from "react";

export function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false);

  function copy(text) {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  return [copied, copy];
}
