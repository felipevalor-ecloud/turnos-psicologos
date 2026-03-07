export interface Slot {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
}

export interface SlotWithBooking extends Slot {
  available: number;
  booking_id: number | null;
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  recurring_booking_id: number | null;
  created_at: string;
}

export interface BookingWithSlot {
  id: number;
  slot_id: number;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  created_at: string;
  date: string;
  start_time: string;
  end_time: string;
  recurring_booking_id: number | null;
}

export interface RecurringBooking {
  id: number;
  psychologist_id: number;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  frequency_weeks: number;
  start_date: string;
  time: string;
  active: number;
  created_at: string;
  next_appointment: string | null;
}

export interface BookingResult {
  id: number;
  slot: { date: string; start_time: string; end_time: string };
  patient: { name: string; email: string; phone: string };
}

export interface Psychologist {
  id: number;
  name: string;
  email: string;
  session_duration_minutes: number;
  cancel_min_hours: number;
  reschedule_min_hours: number;
  booking_min_hours: number;
  whatsapp_number: string | null;
}

export interface WeeklyDaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: number;
}

export interface Holiday {
  date: string;
  localName: string;
  overridden: boolean;
}
