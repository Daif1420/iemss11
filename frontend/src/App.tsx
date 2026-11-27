import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { EmployeeDetailPage } from '@/pages/EmployeeDetailPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { HomePage } from '@/pages/HomePage';
import { ImportPage } from '@/pages/ImportPage';
import { LoginPage } from '@/pages/LoginPage';
import { ManualEntryPage } from '@/pages/ManualEntryPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { SystemSettingsPage } from '@/pages/SystemSettingsPage';
import { ThemesPage } from '@/pages/ThemesPage';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster dir="rtl" position="top-left" richColors closeButton />
          <OfflineIndicator />
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/index.html" element={<LoginPage />} />

            <Route
              path="/home.html"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard.html"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin-employees.html"
              element={
                <ProtectedRoute roles={['supervisor', 'hr_manager', 'admin', 'system_creator']}>
                  <EmployeesPage mode="all" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees-current.html"
              element={
                <ProtectedRoute roles={['supervisor', 'hr_manager', 'admin', 'system_creator']}>
                  <EmployeesPage mode="current" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees-left.html"
              element={
                <ProtectedRoute roles={['supervisor', 'hr_manager', 'admin', 'system_creator']}>
                  <EmployeesPage mode="left" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees-new.html"
              element={
                <ProtectedRoute roles={['supervisor', 'hr_manager', 'admin', 'system_creator']}>
                  <EmployeesPage mode="new" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/employee.html"
              element={
                <ProtectedRoute>
                  <EmployeeDetailPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/reports.html"
              element={
                <ProtectedRoute roles={['supervisor', 'admin', 'system_creator']}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/requests.html"
              element={
                <ProtectedRoute>
                  <RequestsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin-import.html"
              element={
                <ProtectedRoute roles={['supervisor', 'admin', 'system_creator']}>
                  <ImportPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin-manual-entry.html"
              element={
                <ProtectedRoute roles={['admin', 'system_creator']}>
                  <ManualEntryPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/audit-logs.html"
              element={
                <ProtectedRoute roles={['system_creator']}>
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/themes.html"
              element={
                <ProtectedRoute roles={['system_creator']}>
                  <ThemesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings.html"
              element={
                <ProtectedRoute roles={['system_creator']}>
                  <SystemSettingsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
