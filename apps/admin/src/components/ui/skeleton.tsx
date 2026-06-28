import { cn } from "@/lib/utils";

/** Shimmering skeleton block — preferred over spinners for loading states. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("skeleton rounded-md", className)} {...props} />;
}

export { Skeleton };
