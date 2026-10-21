"use client";
import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

// Light/Dark/System, default System; class set before first paint (spec 4.1). The theme script is
// inline, so it receives the per-request CSP nonce.
export function ThemeProvider({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange
      storageKey="mschool-theme" nonce={nonce}>
      {children}
    </NextThemes>
  );
}
