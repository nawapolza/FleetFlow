import { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout.jsx';
import Loading from './components/Loading.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { BranchProvider, useBranch } from './contexts/BranchContext.jsx';
import BranchesPage from './pages/BranchesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FuelCalculatorPage from './pages/FuelCalculatorPage.jsx';
import DeliveriesPage from './pages/DeliveriesPage.jsx';
import EmployeeQuickPage from './pages/EmployeeQuickPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminRecoveryPage from './pages/AdminRecoveryPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import MonthlyReportsPage from './pages/MonthlyReportsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import VehiclesPage from './pages/VehiclesPage.jsx';
import TransportLedgerPage from './pages/TransportLedgerPage.jsx';
import TripFinancePage from './pages/TripFinancePage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  if (window.location.pathname.replace(/\/+$/, '') === '/adminnakub') return <AdminRecoveryPage />;
  if (loading) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <BranchProvider>
      <AppShell />
    </BranchProvider>
  );
}

function AppShell() {
  const { user, isOwner } = useAuth();
  const { activeBranchId, loading: branchLoading, revision } = useBranch();
  const [page, setPage] = useState('quick');

  useEffect(() => {
    if (!user) return;
    setPage(isOwner ? 'dashboard' : 'quick');
  }, [isOwner, user?.id]);

  const pageKey = `${activeBranchId || 'branch'}-${revision}`;
  const pages = useMemo(() => {
    if (!isOwner) {
      return {
        account: <AccountPage key={`account-${pageKey}`} />,
        quick: <EmployeeQuickPage key={`quick-${pageKey}`} />,
        calculator: <FuelCalculatorPage key={`calculator-${pageKey}`} />,
        deliveries: <DeliveriesPage key={`deliveries-${pageKey}`} />,
      };
    }
    return {
      account: <AccountPage key={`account-${pageKey}`} />,
      dashboard: <DashboardPage key={`dashboard-${pageKey}`} setPage={setPage} />,
      branches: <BranchesPage key={`branches-${pageKey}`} />,
      calculator: <FuelCalculatorPage key={`calculator-${pageKey}`} />,
      quick: <EmployeeQuickPage key={`quick-${pageKey}`} />,
      deliveries: <DeliveriesPage key={`deliveries-${pageKey}`} />,
      reports: <MonthlyReportsPage key={`reports-${pageKey}`} />,
      trips: <TripFinancePage key={`trips-${pageKey}`} />,
      ledger: <TransportLedgerPage key={`ledger-${pageKey}`} />,
      users: <UsersPage key={`users-${pageKey}`} />,
      vehicles: <VehiclesPage key={`vehicles-${pageKey}`} />,
      notifications: <NotificationsPage key={`notifications-${pageKey}`} />,
    };
  }, [activeBranchId, isOwner, pageKey]);

  if (branchLoading || !activeBranchId) return <Loading />;

  const safePage = pages[page] ? page : (isOwner ? 'dashboard' : 'quick');
  return (
    <Layout page={safePage} setPage={setPage}>
      {pages[safePage]}
    </Layout>
  );
}
