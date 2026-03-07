import type { Slot, SlotWithBooking, BookingWithSlot, BookingResult, RecurringBooking, WeeklyDaySchedule, Holiday } from './types';

export type ApiResponse<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
  policy_hours?: number;
  whatsapp_number?: string | null;
  psychologist_name?: string;
};

const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('psi_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { success: false, error: 'Error de conexión con el servidor' };
  }
}

// ── Public ───────────────────────────────────────────────────────────────────

export const getContact = () =>
  request<{ nombre: string; whatsapp_number: string | null }>('/contact');

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  request<{ token: string; psychologist: import('./types').Psychologist }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );

export const apiLogout = () => request('/auth/logout', { method: 'POST' });

// ── Profile & Auth ────────────────────────────────────────────────────────────

export const getProfile = () => request<import('./types').Psychologist>('/auth/me');

export const updateProfile = (data: {
  session_duration_minutes?: number;
  cancel_min_hours?: number;
  reschedule_min_hours?: number;
  booking_min_hours?: number;
  whatsapp_number?: string | null;
}) =>
  request<import('./types').Psychologist>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Schedule & Holidays ───────────────────────────────────────────────────────

export const getSchedule = () => request<WeeklyDaySchedule[]>('/schedule');

export const updateSchedule = (schedule: WeeklyDaySchedule[]) =>
  request('/schedule', {
    method: 'PUT',
    body: JSON.stringify({ schedule })
  });

export const getHolidays = (year: number) => request<Holiday[]>(`/holidays?year=${year}`);

export const addHolidayOverride = (date: string) =>
  request('/holidays/override', {
    method: 'POST',
    body: JSON.stringify({ date })
  });

export const removeHolidayOverride = (date: string) =>
  request(`/holidays/override/${date}`, { method: 'DELETE' });

// ── Slots (public) ────────────────────────────────────────────────────────────

export const getSlots = (date: string) =>
  request<Slot[]>(`/slots?date=${date}`);

// ── Slots (admin) ─────────────────────────────────────────────────────────────

export const getAllSlots = (params?: { date?: string; status?: string }) => {
  const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
  return request<SlotWithBooking[]>(`/slots/all${qs ? `?${qs}` : ''}`);
};

export const createSlot = (data: { date: string; start_time: string }) =>
  request<Slot>('/slots', { method: 'POST', body: JSON.stringify(data) });

export const createBatchSlots = (data: {
  start_date: string;
  end_date: string;
  start_time: string;
  days_of_week: number[];
}) =>
  request<{ created: number; skipped: number; dates: string[] }>(
    '/slots/batch',
    { method: 'POST', body: JSON.stringify(data) },
  );

export const updateSlot = (id: number, available: 0 | 1) =>
  request(`/slots/${id}`, { method: 'PATCH', body: JSON.stringify({ available }) });

export const deleteSlot = (id: number) =>
  request(`/slots/${id}`, { method: 'DELETE' });

// ── Bookings (public) ─────────────────────────────────────────────────────────

export const createBooking = (data: {
  slot_id: number;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
}) =>
  request<BookingResult>('/bookings', { method: 'POST', body: JSON.stringify(data) });

export const searchMyBookings = (email: string, phone: string) =>
  request<BookingWithSlot[]>('/bookings/search', {
    method: 'POST',
    body: JSON.stringify({ email, phone }),
  });

export const cancelBooking = (id: number, email?: string, phone?: string) =>
  request(`/bookings/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ email, phone }),
  });

export const rescheduleBooking = (id: number, data: { email?: string; phone?: string; new_slot_id: number }) =>
  request<BookingResult>(`/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Bookings (admin) ──────────────────────────────────────────────────────────

export const getBookings = () => request<BookingWithSlot[]>('/bookings');

// ── Recurring bookings (admin) ────────────────────────────────────────────────

export const getRecurring = () => request<RecurringBooking[]>('/recurring');

export const createRecurring = (data: {
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  start_date: string;
  time: string;
  frequency_weeks: number;
}) =>
  request<{ recurring_booking: RecurringBooking; slots_created: number; slots_skipped: number }>(
    '/recurring',
    { method: 'POST', body: JSON.stringify(data) },
  );

export const cancelRecurring = (id: number, email?: string, phone?: string) =>
  request<{ slots_deleted: number }>(`/recurring/${id}`, {
    method: 'DELETE',
    body: (email || phone) ? JSON.stringify({ email, phone }) : undefined,
  });

export const rescheduleRecurring = (id: number, data: { email?: string; phone?: string; from_date: string; new_time: string }) =>
  request<{ rescheduled_count: number }>(`/recurring/${id}/reschedule-from`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const extendRecurring = () =>
  request<{ slots_created: number; slots_skipped: number }>('/recurring/extend', { method: 'POST' });
