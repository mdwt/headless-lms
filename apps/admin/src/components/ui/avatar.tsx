"use client";

import * as React from "react";
import { Avatar as Av } from "radix-ui";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

function Avatar({ className, ...props }: React.ComponentProps<typeof Av.Root>) {
  return (
    <Av.Root
      data-slot="avatar"
      className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof Av.Image>) {
  return <Av.Image data-slot="avatar-image" className={cn("aspect-square size-full", className)} {...props} />;
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof Av.Fallback>) {
  return (
    <Av.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

/** Convenience: avatar from a name (deterministic soft tint + initials). */
function NameAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export { Avatar, AvatarImage, AvatarFallback, NameAvatar };
