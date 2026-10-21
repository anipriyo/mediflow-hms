import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Spinner, EmptyState, Button } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Appointments from './pages/Appointments.jsx';
import Queue from './pages/Queue.jsx';
import Consultation from './pages/Consultation.jsx';
import Lab from './pages/Lab.jsx';
import Pharmacy from './pages/Pharmacy.jsx';
import Beds from './pages/Beds.jsx';
import AdmissionDetail from './pages/AdmissionDetail.jsx';
import Billing from './pages/Billing.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import { PrintInvoice, PrintReceipt } from './pages/Print.jsx';
import Reports from './pages/Reports.jsx';
import Doctors from './pages/Doctors.jsx';
import UsersPage from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Restoring session…" className="min-h-screen" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Guard({ perm, children }) {
  const { canAny } = useAuth();
  if (!canAny(...[].concat(perm))) {
    return (
      <div className="card mx-auto mt-10 max-w-lg">
        <EmptyState icon={ShieldAlert} title="Access denied" message="Your role does not have permission to open this page." action={<Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>} />
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/print/invoice/:id" element={<RequireAuth><Guard perm="billing:read"><PrintInvoice /></Guard></RequireAuth>} />
      <Route path="/print/receipt/:id" element={<RequireAuth><Guard perm="billing:read"><PrintReceipt /></Guard></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Guard perm="patients:read"><Patients /></Guard>} />
        <Route path="patients/:id" element={<Guard perm="patients:read"><PatientDetail /></Guard>} />
        <Route path="appointments" element={<Guard perm="appointments:read"><Appointments /></Guard>} />
        <Route path="queue" element={<Guard perm="queue:read"><Queue /></Guard>} />
        <Route path="consultation" element={<Guard perm="consultation:write"><Consultation /></Guard>} />
        <Route path="lab" element={<Guard perm="lab:read"><Lab /></Guard>} />
        <Route path="pharmacy" element={<Guard perm="pharmacy:read"><Pharmacy /></Guard>} />
        <Route path="beds" element={<Guard perm={['beds:read', 'admissions:read']}><Beds /></Guard>} />
        <Route path="admissions/:id" element={<Guard perm="admissions:read"><AdmissionDetail /></Guard>} />
        <Route path="billing" element={<Guard perm="billing:read"><Billing /></Guard>} />
        <Route path="billing/invoices/:id" element={<Guard perm="billing:read"><InvoiceDetail /></Guard>} />
        <Route path="reports" element={<Guard perm="reports:read"><Reports /></Guard>} />
        <Route path="doctors" element={<Guard perm="doctors:manage"><Doctors /></Guard>} />
        <Route path="users" element={<Guard perm="users:manage"><UsersPage /></Guard>} />
        <Route path="audit" element={<Guard perm="audit:read"><Audit /></Guard>} />
        <Route path="*" element={<div className="card"><EmptyState title="Page not found" message="The page you are looking for does not exist." /></div>} />
      </Route>
    </Routes>
  );
}
