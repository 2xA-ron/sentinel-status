import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // A default staleTime of 0 means any loader-prefetched query is
      // treated as stale the instant it mounts, so the client kicks off a
      // background refetch right on top of the hydration pass — occasionally
      // landing mid-reconciliation and producing a hydration-mismatch
      // warning for anything derived from the response (e.g. a
      // server-timestamp field). A few seconds of headroom is enough for
      // hydration to settle first; RealtimeProvider still keeps data fresh
      // in between by writing simulated updates straight into the cache.
      queries: { staleTime: 5_000 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Dehydrates queries fetched by route loaders into the SSR payload and
  // hydrates them into the client's QueryClient before first render, so the
  // client reuses the server's data instead of silently refetching on mount
  // (which was producing React hydration mismatches on any loader-fetched
  // data containing a timestamp, e.g. the dashboard summary's generatedAt).
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
