import { QueryClient as QC } from "@tanstack/react-query";

/**
 * The global query client instance used throughout the application.
 */
export const queryClient = new QC({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});
