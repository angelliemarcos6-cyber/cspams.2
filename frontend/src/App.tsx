import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/context/Auth";
import { DataProvider } from "@/context/Data";
import type { UserRole } from "@/types";
import { Login } from "@/pages/Login";
import { MonitorDashboard } from "@/pages/MonitorDashboard";
import { SchoolAdminDashboard } from "@/pages/SchoolAdminDashboard";

function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: ReactNode;
  allowedRole: Exclude<UserRole, null>;
}) {
  const { role } = useAuth();

  if (!role) {
    return <Navigate to="/" replace />;
  }

  if (role !== allowedRole) {
    return <Navigate to={role === "school_admin" ? "/school-admin" : "/monitor"} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { role } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={role ? <Navigate to={role === "school_admin" ? "/school-admin" : "/monitor"} replace /> : <Login />}
      />
      <Route
        path="/school-admin"
        element={
          <ProtectedRoute allowedRole="school_admin">
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

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </DataProvider>
    </AuthProvider>
  );
}
