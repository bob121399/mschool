import Image from "next/image";
import { cn } from "@/components/ui/cn";

// Brand assets are cropped/resized from the owner's logo files (docs/brand/*-source.*), never redrawn.
// Each variant keeps its own background, so it is shown as a tile; the theme picks light or dark.
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden rounded-lg", className)} style={{ width: size, height: size }}>
      <Image src="/brand/mark-light.png" alt="" width={size} height={size} unoptimized className="size-full dark:hidden" />
      <Image src="/brand/mark-dark.png" alt="" width={size} height={size} unoptimized className="hidden size-full dark:block" />
    </span>
  );
}

/** Full logo with wordmark (480×544 source). `width` sets the rendered width. */
export function BrandLogo({ className, width = 160 }: { className?: string; width?: number }) {
  const height = Math.round((width * 544) / 480);
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden rounded-2xl", className)} style={{ width, height }}>
      <Image src="/brand/logo-light.png" alt="MSchool" width={width} height={height} unoptimized priority className="size-full dark:hidden" />
      <Image src="/brand/logo-dark.png" alt="MSchool" width={width} height={height} unoptimized priority className="hidden size-full dark:block" />
    </span>
  );
}
