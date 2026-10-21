"use client";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "./cn";

const options = [
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "dark", label: "Тёмная", Icon: Moon },
  { value: "system", label: "Системная", Icon: Monitor },
] as const;

const subscribe = () => () => {};
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <div role="radiogroup" aria-label="Тема оформления" className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button key={value} type="button" role="radio" aria-checked={active} aria-label={label} title={label}
            onClick={() => setTheme(value)}
            className={cn("inline-flex size-9 items-center justify-center rounded-md", active ? "bg-muted" : "hover:bg-muted/60")}>
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
