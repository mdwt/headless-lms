"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import { ApiError } from "@/lib/api/http";
import { signOut } from "@/lib/auth/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * App-wide providers. The QueryClient centralizes 401/403 handling so no
 * component has to: a 401 clears the session and bounces to /login; a 403 is
 * surfaced as a forbidden state by the component that owns the query.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [client] = React.useState(() => {
    const handleGlobalError = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        void signOut().then(() => router.replace("/login"));
      }
    };

    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (count, error) => {
            // Don't retry auth/permission/not-found — only transient failures.
            if (error instanceof ApiError && [401, 403, 404, 409, 422].includes(error.status)) {
              return false;
            }
            return count < 2;
          },
          refetchOnWindowFocus: false,
        },
        mutations: { retry: false },
      },
      queryCache: new QueryCache({ onError: handleGlobalError }),
      mutationCache: new MutationCache({ onError: handleGlobalError }),
    });
  });

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
