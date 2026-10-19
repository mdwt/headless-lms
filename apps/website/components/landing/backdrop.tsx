import Image from "next/image";
import type { CSSProperties } from "react";
import dawn from "@/assets/backdrops/clouds-dawn.webp";
import dusk from "@/assets/backdrops/dusk.webp";
import golden from "@/assets/backdrops/golden.webp";
import haze from "@/assets/backdrops/haze.webp";
import meadow from "@/assets/backdrops/meadow.webp";
import sky from "@/assets/backdrops/sky.webp";
import towers from "@/assets/backdrops/clouds-tall.webp";
import towersHero from "@/assets/backdrops/towers-hero.webp";
import { cn } from "@/lib/utils";

const paintings = { dawn, dusk, golden, haze, meadow, sky, towers, towersHero };

export type Painting = keyof typeof paintings;

export function Backdrop({
  name,
  sizes,
  priority = false,
  className,
  style,
}: {
  name: Painting;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Image
      src={paintings[name]}
      alt=""
      aria-hidden="true"
      fill
      sizes={sizes}
      priority={priority}
      placeholder="blur"
      draggable={false}
      className={cn("pointer-events-none object-cover select-none", className)}
      style={style}
    />
  );
}
