import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session';
import { isConfigured } from './lib/supabase';
import { Loading } from './components/ui';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/auth/Auth';
import { Invite } from './pages/auth/Invite';
import { SetupPractice } from './pages/auth/SetupPractice';
import { PractitionerLayout } from './pages/pro/Layout';
import { Today } from './pages/pro/Today';
import { Clients } from './pages/pro/Clients';
import { ClientProfile } from './pages/pro/ClientProfile';
import { Checkins } from './pages/pro/Checkins';
import { Templates } from './pages/pro/Templates';
import { Products } from './pages/pro/Products';
import { Learn } from './pages/pro/Learn';
import { Messages } from './pages/pro/Messages';
import { Settings } from './pages/pro/Settings';
import { ClientLayout } from './pages/client/Layout';
import { ClientHome } from './pages/client/Home';
import { ClientCheckin } from './pages/client/Checkin';
import { ClientRoutine } from './pages/client/Routine';
import { ClientProgress } from './pages/client/Progress';
import { ClientMessages } from './pages/client/Messages';
import { ClientLesson } from './pages/client/Lesson';

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/invite/:code" element={<Invite />} />
      <Route path="/setup" element={<RequireSignedIn><SetupPractice /></RequireSignedIn>} />

      <Route path="/app" element={<RequireRole role="practitioner"><PractitionerLayout /></RequireRole>}>
        <Route index element={<Today />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientProfile />} />
        <Route path="checkins" element={<Checkins />} />
        <Route path="templates" element={<Templates />} />
        <Route path="products" element={<Products />} />
        <Route path="learn" element={<Learn />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:clientId" element={<Messages />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/me" element={<RequireRole role="client"><ClientLayout /></RequireRole>}>
        <Route index element={<ClientHome />} />
        <Route path="checkin" element={<ClientCheckin />} />
        <Route path="routine" element={<ClientRoutine />} />
        <Route path="progress" element={<ClientProgress />} />
        <Route path="messages" element={<ClientMessages />} />
        <Route path="learn/:id" element={<ClientLesson />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Home() {
  const { who } = useSession();
  if (who.kind === 'loading') return <Loading />;
  if (who.kind === 'signed-out') return <Navigate to="/login" replace />;
  if (who.kind === 'practitioner') return <Navigate to="/app" replace />;
  if (who.kind === 'client') return <Navigate to="/me" replace />;
  return <Navigate to="/setup" replace />;
}

function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const { who } = useSession();
  const loc = useLocation();
  if (who.kind === 'loading') return <Loading />;
  if (who.kind === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

function RequireRole({ role, children }: { role: 'practitioner' | 'client'; children: React.ReactNode }) {
  const { who } = useSession();
  const loc = useLocation();
  if (who.kind === 'loading') return <Loading />;
  if (who.kind === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (who.kind !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotConfigured() {
  return (
    <div className="auth">
      <div className="card stack">
        <h1>Almost there</h1>
        <p className="muted">Skinroom isn't connected to its database yet. Add the Supabase URL and key to the <code>.env</code> file (see SETUP.md), then restart.</p>
      </div>
    </div>
  );
}
