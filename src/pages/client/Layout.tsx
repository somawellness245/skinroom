import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useClientSelf, useSession } from '../../lib/session';
import { Icon, PracticeLogo, useBrand } from '../../components/ui';

export function ClientLayout() {
  const { client, practice } = useClientSelf();
  const { signOut } = useSession();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  useBrand(practice);

  useEffect(() => {
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('client_id', client.id).neq('sender_role', 'client').is('read_by_client_at', null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [client.id, loc.pathname]);

  return (
    <div className="phone">
      <header className="phone-top">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <PracticeLogo practice={practice} size={36} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>{practice.name}</div>
            <div style={{ fontSize: 11 }} className="muted">Powered by Skinroom</div>
          </div>
        </div>
        <button className="btn link small" onClick={signOut}>Log out</button>
      </header>
      <main className="phone-main">
        <Outlet />
      </main>
      <div className="tabbar">
        <nav aria-label="App">
          <NavLink to="/me" end><Icon name="home" />Home</NavLink>
          <NavLink to="/me/routine"><Icon name="list" />Routine</NavLink>
          <NavLink to="/me/progress"><Icon name="camera" />Progress</NavLink>
          <NavLink to="/me/messages">
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name="chat" />
              {unread > 0 && <span className="dot" aria-hidden="true" style={{ position: 'absolute', top: 0, right: -4 }} />}
            </span>
            Messages{unread > 0 && <span className="sr"> ({unread} unread)</span>}
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
