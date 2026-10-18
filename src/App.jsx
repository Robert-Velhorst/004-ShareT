import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const App = lazy(() => import("./pages/App"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./components/ForgetPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TrelloCallback = lazy(() => import("./pages/TrelloCallback"));
const SharedLinkAccess = lazy(() => import("./components/SharedLinkAccess"));
const SharedCardView = lazy(() => import("./components/SharedCardView"));
const Privacy = lazy(() => import("./pages/LegalPages").then(module => ({ default: module.Privacy })));
const Terms = lazy(() => import("./pages/LegalPages").then(module => ({ default: module.Terms })));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
    <p className="text-sm text-muted-foreground">Loading ShareT…</p>
  </div>
);

// Wrapper to extract route params and pass as props
const SharedPage = () => {
  const { shareId } = useParams();
  return (
    <div className="min-h-screen bg-background p-8">
      <SharedLinkAccess linkToken={shareId} />
    </div>
  );
};

const SharedCardPage = () => {
  const { shareId } = useParams();
  return <SharedCardView linkToken={shareId} />;
};

const NotFound = () => (
  <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
    <h1 className="text-3xl font-bold">Page not found</h1>
    <p className="text-muted-foreground">This ShareT address does not exist or is no longer available.</p>
    <a className="text-primary underline" href="/">Return to ShareT</a>
  </main>
);

const queryClient = new QueryClient();

const AppWrapper = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter
          future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
          }}
        >
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/forgetpassword" element={<ForgotPassword />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/trello/callback" element={<TrelloCallback />} />
                <Route path="/shared/:shareId" element={<SharedPage />} />
                <Route path="/shared/:shareId/card" element={<SharedCardPage />} />
                {/* Retain compatibility with early links that used /share. */}
                <Route path="/share/:shareId" element={<SharedPage />} />
                <Route path="/share/:shareId/card" element={<SharedCardPage />} />
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <App />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default AppWrapper;
