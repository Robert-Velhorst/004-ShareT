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
                <Route path="/trello/callback" element={<TrelloCallback />} />
                <Route path="/shared/:shareId" element={<SharedPage />} />
                <Route path="/shared/:shareId/card" element={<SharedCardPage />} />
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <App />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default AppWrapper;
