import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useSession, usePractitioner } from '../../lib/session';
import { Icon, Mark, useBrand } from '../../components/ui';

export function PractitionerLayout() {
  const { practice } = usePractitioner();
  const { signOut } = useSession();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  const [toReview, setToReview] = useState(0);
  useBrand(practice);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('practice_id', practice.id).eq('sender_role', 'client').is('read_by_practice_at', null),
      supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('practice_id', practice.id).is('reviewed_at', null),
    ]).then(([m, c]) => {
      if (!live) return;
      setUnread(m.count ?? 0);
      setToReview(c.count ?? 0);
    });
    return () => { live = false; };
  }, [practice.id, loc.pathname]);

  const trialDays = Math.ceil((new Date(practice.trial_ends_at).getTime() - Date.now()) / 86400000);

  return (
    <div>
      <header className="topbar">
        <Link to="/app" className="brand">
          <Mark />
          <span className="brand-name">Skinroom</span>
          <span className="tag">{practice.name}</span>
        </Link>
        <div className="row">
          {practice.subscription_status === 'trialing' && trialDays >= 0 && (
            <Link to="/app/settings#plan" className="small muted">{trialDays} days left in trial</Link>
          )}
          {(practice.subscription_status === 'past_due' || practice.subscription_status === 'canceled' || (practice.subscription_status === 'trialing' && trialDays < 0)) && (
            <Link to="/app/settings#plan" className="tag warn">Update billing</Link>
          )}
          <button className="btn" onClick={signOut} aria-label="Log out"><Icon name="out" size={18} /> Log out</button>
        </div>
      </header>
      <div className="shell">
        <nav className="sidenav" aria-label="Main">
          <NavLink to="/app" end>Today</NavLink>
          <NavLink to="/app/clients">Clients</NavLink>
          <NavLink to="/app/checkins">Check-ins {toReview > 0 && <span className="tag">{toReview}</span>}</NavLink>
          <NavLink to="/app/templates">Plan templates</NavLink>
          <NavLink to="/app/products">Product shelf</NavLink>
          <NavLink to="/app/learn">Learn library</NavLink>
          <NavLink to="/app/messages">Messages {unread > 0 && <span className="tag warn">{unread}</span>}</NavLink>
          <hr />
          <NavLink to="/app/settings">Branding &amp; settings</NavLink>
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
