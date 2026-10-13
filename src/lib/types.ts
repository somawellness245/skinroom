export type Practice = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  bg_color: string;
  surface_color: string;
  text_color: string;
  checkin_every_days: number;
  quiet_after_days: number;
  send_reminders: boolean;
  booking_url: string | null;
  shop_url: string | null;
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
  trial_ends_at: string;
};

export type PlanTemplate = { id: string; practice_id: string; name: string; description: string | null };

export type Phase = {
  id: string;
  template_id: string;
  practice_id: string;
  position: number;
  name: string;
  focus: string | null;
  description: string | null;
  duration_label: string | null;
  checkin_every_days: number | null;
};

export type Client = {
  id: string;
  practice_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  location: string | null;
  main_concern: string | null;
  goal: string | null;
  sensitivities: string | null;
  fitzpatrick: string | null;
  is_virtual: boolean;
  started_on: string;
  plan_template_id: string | null;
  current_phase_id: string | null;
  phase_started_on: string | null;
  next_checkin_on: string | null;
  invite_code: string;
  archived: boolean;
  created_at: string;
};

export type Product = {
  id: string;
  practice_id: string;
  name: string;
  category: string | null;
  size: string | null;
  lasts_days: number | null;
  shop_url: string | null;
  image_url: string | null;
  active: boolean;
};

export type RegimenStep = {
  id: string;
  client_id: string;
  practice_id: string;
  time_of_day: 'am' | 'pm';
  position: number;
  product_id: string | null;
  label: string;
  instructions: string | null;
  frequency: string | null;
  supply_started_on: string | null;
};

export type Checkin = {
  id: string;
  client_id: string;
  practice_id: string;
  submitted_at: string;
  nights_followed: '0-2' | '3-4' | '5-6' | '7' | null;
  concern_change: 'worse' | 'same' | 'better' | null;
  reactions: string[];
  note: string | null;
  reviewed_at: string | null;
  response: string | null;
};

export type Photo = {
  id: string;
  client_id: string;
  practice_id: string;
  checkin_id: string | null;
  kind: 'baseline' | 'checkin' | 'session';
  angle: 'front' | 'left' | 'right' | 'other';
  storage_path: string;
  taken_on: string;
};

export type Message = {
  id: string;
  client_id: string;
  practice_id: string;
  sender_role: 'practitioner' | 'client' | 'system';
  sender_user_id: string | null;
  body: string;
  created_at: string;
  read_by_practice_at: string | null;
  read_by_client_at: string | null;
};

export type Lesson = {
  id: string;
  practice_id: string;
  title: string;
  summary: string | null;
  body: string;
  read_minutes: number | null;
  all_phases: boolean;
  phase_ids: string[];
  published: boolean;
  updated_at: string;
};

export const REACTIONS = ['Stinging', 'Redness', 'Peeling', 'Dryness', 'New breakouts', 'Itching'] as const;
export const ANGLES = ['front', 'left', 'right'] as const;
