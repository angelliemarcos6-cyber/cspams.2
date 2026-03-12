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
import { MonitorDashboard } from "@/pages/MonitorDashboard";
import { SchoolAdminDashboard } from "@/pages/SchoolAdminDashboard";
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
      <Route
        path="/school-admin"
        element={
          <ProtectedRoute allowedRole="school_head">
            <SchoolAdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/school-admin" replace />} />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute allowedRole="monitor">
            <MonitorDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RealtimeBridge() {
  const { token, role, user } = useAuth();
  const schoolId = user?.schoolId ?? null;

  useEffect(() => {
    if (!token || !role) {
      stopRealtimeBridge();
      return;
    }

    startRealtimeBridge(token, {
      role,
      schoolId,
    });

    return () => {
      stopRealtimeBridge();
    };
  }, [token, role, schoolId]);

  return null;
}

export function App() {
  return (
    <AuthProvider>
      <RealtimeBridge />
      <NotificationProvider>
        <DataProvider>
          <IndicatorDataProvider>
            <TeacherDataProvider>
              <StudentDataProvider>
                <HashRouter>
                  <AppRoutes />
                </HashRouter>
              </StudentDataProvider>
            </TeacherDataProvider>
          </IndicatorDataProvider>
        </DataProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
