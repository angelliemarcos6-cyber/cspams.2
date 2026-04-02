import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/Auth";
import { DataProvider } from "@/context/Data";
import { IndicatorDataProvider } from "@/context/IndicatorData";
import { NotificationProvider } from "@/context/Notifications";
import { StudentDataProvider } from "@/context/StudentData";
import { TeacherDataProvider } from "@/context/TeacherData";
import type { UserRole } from "@/types";
import { Login } from "@/pages/Login";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { MfaResetComplete } from "@/pages/MfaResetComplete";
import { MfaResetRequest } from "@/pages/MfaResetRequest";
import { MonitorDashboard } from "@/pages/MonitorDashboard";
import { ResetPassword } from "@/pages/ResetPassword";
import { SchoolAdminDashboard } from "@/pages/SchoolAdminDashboard";
import { SetupAccount } from "@/pages/SetupAccount";
import { COOKIE_SESSION_TOKEN } from "@/lib/api";
import { startRealtimeBridge, stopRealtimeBridge } from "@/lib/realtime";

function FullscreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page-bg px-4">
      <div className="surface-panel flex w-full max-w-sm items-center gap-3 border p-5">
        <img src="/depedlogo.png" alt="DepEd logo" className="h-11 w-auto bg-white px-1.5 py-1" />
        <div className="flex-1">
          <p className="text-sm font-bold text-primary-800">CSPAMS</p>
          <p className="text-xs text-slate-600">Loading synchronized records...</p>
        </div>
        <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: ReactNode;
  allowedRole: Exclude<UserRole, null>;
}) {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return <FullscreenLoader />;
  }

  if (!role) {
    return <Navigate to="/" replace />;
  }

  if (role !== allowedRole) {
    return <Navigate to={role === "school_head" ? "/school-admin" : "/monitor"} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return <FullscreenLoader />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={role ? <Navigate to={role === "school_head" ? "/school-admin" : "/monitor"} replace /> : <Login />}
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/mfa-reset" element={<MfaResetRequest />} />
      <Route path="/mfa-reset/complete" element={<MfaResetComplete />} />
      <Route path="/setup-account" element={<SetupAccount />} />
      <Route
        path="/school-admin"
        element={
          <ProtectedRoute allowedRole="school_head">
            <AuthenticatedAppProviders>
              <DashboardDataProviders>
                <SchoolAdminDashboard />
              </DashboardDataProviders>
            </AuthenticatedAppProviders>
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/school-admin" replace />} />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute allowedRole="monitor">
            <AuthenticatedAppProviders>
              <DashboardDataProviders>
                <MonitorDashboard />
              </DashboardDataProviders>
            </AuthenticatedAppProviders>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RealtimeBridge() {
  const { role, user } = useAuth();
  const hasCookieSession = Boolean(user && role);
  const schoolId = user?.schoolId ?? null;

  useEffect(() => {
    if (!hasCookieSession || !role) {
      stopRealtimeBridge();
      return;
    }

    startRealtimeBridge(COOKIE_SESSION_TOKEN, {
      role,
      schoolId,
    });

    return () => {
      stopRealtimeBridge();
    };
  }, [hasCookieSession, role, schoolId]);

  return null;
}

function AuthenticatedAppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <RealtimeBridge />
      <NotificationProvider>{children}</NotificationProvider>
    </>
  );
}

function DashboardDataProviders({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <IndicatorDataProvider>
        <TeacherDataProvider>
          <StudentDataProvider>{children}</StudentDataProvider>
        </TeacherDataProvider>
      </IndicatorDataProvider>
    </DataProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  );
}
