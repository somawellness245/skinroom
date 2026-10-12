import { supabase, must } from './supabase';
import { addDays, daysBetween, daysSince, today } from './dates';
import type { Checkin, Client, Phase, PlanTemplate, Practice, Product, RegimenStep } from './types';

export type ClientRow = Client & {
  lastCheckin: Pick<Checkin, 'id' | 'submitted_at' | 'reviewed_at'> | null;
  status: ClientStatus;
  phase: Phase | null;
};

export type ClientStatus = 'not-joined' | 'needs-review' | 'quiet' | 'overdue' | 'due-soon' | 'on-track';

export const STATUS_LABEL: Record<ClientStatus, string> = {
  'not-joined': 'Invite not accepted',
  'needs-review': 'Needs review',
  quiet: 'Gone quiet',
  overdue: 'Check-in overdue',
  'due-soon': 'Due this week',
  'on-track': 'On track',
};

export function clientStatus(c: Client, last: ClientRow['lastCheckin'], practice: Practice): ClientStatus {
  if (!c.user_id) return 'not-joined';
  if (last && !last.reviewed_at) return 'needs-review';
  const lastActive = last?.submitted_at ?? c.created_at;
  if (daysSince(lastActive.slice(0, 10)) >= practice.quiet_after_days) return 'quiet';
  if (c.next_checkin_on) {
    const d = daysBetween(today(), c.next_checkin_on);
    if (d < 0) return 'overdue';
    if (d <= 7) return 'due-soon';
  }
  return 'on-track';
}

export async function loadPhases(practiceId: string): Promise<Phase[]> {
  return must(await supabase.from('template_phases').select('*').eq('practice_id', practiceId).order('position')) as Phase[];
}

export async function loadTemplates(practiceId: string): Promise<PlanTemplate[]> {
  return must(await supabase.from('plan_templates').select('*').eq('practice_id', practiceId).order('created_at')) as PlanTemplate[];
}

export async function loadClientRows(practice: Practice): Promise<ClientRow[]> {
  const [clients, phases, checkins] = await Promise.all([
    supabase.from('clients').select('*').eq('practice_id', practice.id).eq('archived', false).order('first_name'),
    loadPhases(practice.id),
    supabase.from('checkins').select('id, client_id, submitted_at, reviewed_at').eq('practice_id', practice.id).order('submitted_at', { ascending: false }).limit(2000),
  ]);
  const latest = new Map<string, ClientRow['lastCheckin']>();
  for (const ck of must(checkins) as Checkin[]) if (!latest.has(ck.client_id)) latest.set(ck.client_id, ck);
  const phaseById = new Map(phases.map((p) => [p.id, p]));
  return (must(clients) as Client[]).map((c) => {
    const last = latest.get(c.id) ?? null;
    return { ...c, lastCheckin: last, status: clientStatus(c, last, practice), phase: c.current_phase_id ? phaseById.get(c.current_phase_id) ?? null : null };
  });
}

export type Reorder = { step: RegimenStep; product: Product; runsOutOn: string; daysLeft: number };

/** Products running out soon, based on when the client started the supply and how long it lasts. */
export function reordersFor(steps: RegimenStep[], products: Product[], withinDays = 14): Reorder[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: Reorder[] = [];
  for (const s of steps) {
    const p = s.product_id ? byId.get(s.product_id) : undefined;
    if (!p?.lasts_days || !s.supply_started_on) continue;
    const key = `${s.client_id}:${p.id}`;
    if (seen.has(key)) continue; // same product used AM and PM counts once
    seen.add(key);
    const runsOutOn = addDays(s.supply_started_on, p.lasts_days);
    const daysLeft = daysBetween(today(), runsOutOn);
    if (daysLeft <= withinDays) out.push({ step: s, product: p, runsOutOn, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** "Correct · wk 3" or "Correct · mo 2" depending on how long they've been in the phase. */
export function phaseLabel(phase: Phase | null, phaseStarted: string | null): string {
  if (!phase) return 'No plan yet';
  const weeks = phaseStarted ? Math.max(1, Math.floor(daysSince(phaseStarted) / 7) + 1) : null;
  const when = weeks == null ? '' : weeks < 9 ? ` · wk ${weeks}` : ` · mo ${Math.floor(daysSince(phaseStarted!) / 30) + 1}`;
  return `${phase.name}${when}`;
}
