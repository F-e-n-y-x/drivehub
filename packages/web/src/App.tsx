import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { AppLayout } from "@/components/layout/app-layout";

// Pages are code-split per route so the heavy ones (Browser + file preview,
// brand icons, radix menus) don't weigh down the initial load.
const DashboardPage = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const RemotesPage = lazy(() => import("@/pages/remotes").then((m) => ({ default: m.RemotesPage })));
const JobsPage = lazy(() => import("@/pages/jobs").then((m) => ({ default: m.JobsPage })));
const JobRunsPage = lazy(() => import("@/pages/job-runs").then((m) => ({ default: m.JobRunsPage })));
const BrowserPage = lazy(() => import("@/pages/browser").then((m) => ({ default: m.BrowserPage })));
const ActivityPage = lazy(() => import("@/pages/activity").then((m) => ({ default: m.ActivityPage })));
const SettingsPage = lazy(() => import("@/pages/settings").then((m) => ({ default: m.SettingsPage })));
const LogsPage = lazy(() => import("@/pages/logs").then((m) => ({ default: m.LogsPage })));
const TerminalPage = lazy(() => import("@/pages/terminal").then((m) => ({ default: m.TerminalPage })));
const NotFoundPage = lazy(() => import("@/pages/not-found").then((m) => ({ default: m.NotFoundPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/remotes" element={<RemotesPage />} />
                  <Route path="/jobs" element={<JobsPage />} />
                  <Route path="/jobs/:id/runs" element={<JobRunsPage />} />
                  <Route path="/browser" element={<BrowserPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/terminal" element={<TerminalPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
