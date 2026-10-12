import { useEffect, type ReactNode } from 'react';
import type { Phase, Practice } from '../lib/types';

/** Applies the practice's brand color across the app. */
export function useBrand(practice: Pick<Practice, 'brand_color'> | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const hex = practice?.brand_color && /^#[0-9a-f]{6}$/i.test(practice.brand_color) ? practice.brand_color : '#1E5C57';
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-ink', mix(hex, '#000000', 0.35));
    root.style.setProperty('--accent-soft', mix(hex, '#FFFFFF', 0.87));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
  }, [practice?.brand_color]);
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function initials(first: string, last?: string | null) {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';
}

export function clientName(c: { first_name: string; last_name: string | null }) {
  return c.last_name ? `${c.first_name} ${c.last_name[0]}.` : c.first_name;
}

export function Mark({ size = 36 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M9 4v16" />
      </svg>
    </span>
  );
}

export function PracticeLogo({ practice, size = 40 }: { practice: Practice; size?: number }) {
  if (practice.logo_url) {
    return <img src={practice.logo_url} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 10 }} />;
  }
  return (
    <span className="avatar" style={{ width: size, height: size, background: 'var(--accent)', color: '#fff' }} aria-hidden="true">
      {practice.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="empty" role="status">{label}</div>;
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="error" role="alert">{error}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="between">
          <h2>{title}</h2>
          <button type="button" className="btn link" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PhaseBar({ phases, currentId, compact = false, onDark = false }: { phases: Phase[]; currentId: string | null; compact?: boolean; onDark?: boolean }) {
  if (!phases.length) return null;
  const idx = phases.findIndex((p) => p.id === currentId);
  return (
    <div className="phases" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
      {phases.map((p, i) => {
        const state = idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'now' : 'todo';
        const bar = onDark
          ? { background: state === 'done' ? '#fff' : state === 'now' ? 'linear-gradient(90deg,#fff 50%,rgba(255,255,255,.35) 50%)' : 'rgba(255,255,255,.35)' }
          : undefined;
        return (
          <div key={p.id} className="stack" style={{ gap: 6 }}>
            <div className={`phase-bar ${state === 'todo' ? '' : state}`} style={bar} />
            {!compact && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{i + 1} · {p.name}</div>
                <div className="small" style={{ color: state === 'now' ? 'var(--accent)' : 'var(--muted)', fontWeight: state === 'now' ? 600 : 400 }}>
                  {state === 'now' ? 'Now' : state === 'done' ? 'Done' : p.focus ?? ''}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const paths: Record<string, ReactNode> = {
  home: <path d="M4 11l8-6 8 6v9H4z" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M9 7l1.5-2h3L15 7" /></>,
  chat: <path d="M5 5h14v10H9l-4 4z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5 9-10" />,
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  book: <><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M5 16a4 4 0 0 1 4-4h10" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  out: <><path d="M10 5H5v14h5" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
