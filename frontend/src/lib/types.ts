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
}
