import { supabase, must } from '../../lib/supabase';
import type { Checkin, Client, Lesson, Message, Phase, Photo, Product, RegimenStep } from '../../lib/types';

export async function loadClientWorld(client: Client) {
  const [phases, steps, products, checkins, photos, messages, lessons] = await Promise.all([
    client.plan_template_id
      ? supabase.from('template_phases').select('*').eq('template_id', client.plan_template_id).order('position')
      : Promise.resolve({ data: [], error: null }),
    supabase.from('regimen_steps').select('*').eq('client_id', client.id).order('position'),
    supabase.from('products').select('*').eq('practice_id', client.practice_id),
    supabase.from('checkins').select('*').eq('client_id', client.id).order('submitted_at', { ascending: false }),
    supabase.from('photos').select('*').eq('client_id', client.id).order('taken_on'),
    supabase.from('messages').select('*').eq('client_id', client.id).eq('sender_role', 'practitioner').order('created_at', { ascending: false }).limit(1),
    supabase.from('lessons').select('*').eq('practice_id', client.practice_id).eq('published', true).order('created_at'),
  ]);
  const allLessons = must(lessons) as Lesson[];
  return {
    phases: must(phases) as Phase[],
    steps: must(steps) as RegimenStep[],
    products: must(products) as Product[],
    checkins: must(checkins) as Checkin[],
    photos: must(photos) as Photo[],
    lastNote: (must(messages) as Message[])[0] ?? null,
    // The database only returns lessons this client may see; order personal ones first.
    lessons: [...allLessons].sort((a, b) => Number((b.client_ids ?? []).includes(client.id)) - Number((a.client_ids ?? []).includes(client.id))),
  };
}

/** Which routine to show right now: AM before 3pm, PM after. */
export function currentTimeOfDay(): 'am' | 'pm' {
  return new Date().getHours() < 15 ? 'am' : 'pm';
}
