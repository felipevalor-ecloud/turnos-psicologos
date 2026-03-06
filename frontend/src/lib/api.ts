import type { Slot, SlotWithBooking, BookingWithSlot, BookingResult } from './types';

export type ApiResponse<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
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

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  request<{ token: string; psychologist: { id: number; name: string; email: string } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );

export const apiLogout = () => request('/auth/logout', { method: 'POST' });

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

export const cancelBooking = (id: number, email: string, phone: string) =>
  request(`/bookings/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ email, phone }),
  });

// ── Bookings (admin) ──────────────────────────────────────────────────────────

export const getBookings = () => request<BookingWithSlot[]>('/bookings');
