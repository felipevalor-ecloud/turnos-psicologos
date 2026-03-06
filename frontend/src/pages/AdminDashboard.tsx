import { useState, useEffect, useCallback } from 'react';
import { SlotForm } from '../components/SlotForm';
import {
  getAllSlots,
  getBookings,
  updateSlot,
  deleteSlot,
  apiLogout,
  getRecurring,
  createRecurring,
  cancelRecurring,
  getProfile,
  updateProfile,
  createBooking,
} from '../lib/api';
import type { Psychologist, SlotWithBooking, BookingWithSlot, RecurringBooking } from '../lib/types';

type Tab = 'agenda' | 'create' | 'bookings' | 'recurring' | 'settings';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function getWeekDates(refDate: Date): Date[] {
  const day = refDate.getDay();
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

interface Props {
  psychologist: Psychologist;
  onLogout: () => void;
}

export function AdminDashboard({ psychologist, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('agenda');
  const [weekRef, setWeekRef] = useState(new Date());
  const [slots, setSlots] = useState<SlotWithBooking[]>([]);
  const [bookings, setBookings] = useState<BookingWithSlot[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringBooking[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const [actionError, setActionError] = useState('');
  const [recurringForm, setRecurringForm] = useState({
    patient_name: '',
    patient_email: '',
    patient_phone: '',
    start_date: '',
    time: '',
    frequency_weeks: 1,
  });
  const [recurringFormError, setRecurringFormError] = useState('');
  const [recurringFormSuccess, setRecurringFormSuccess] = useState('');

  const [sessionDuration, setSessionDuration] = useState<number>(psychologist.session_duration_minutes || 45);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedSlotForBlock, setSelectedSlotForBlock] = useState<SlotWithBooking | null>(null);
  const [assignForm, setAssignForm] = useState({ patient_name: '', patient_email: '', patient_phone: '' });
  const [assignFormError, setAssignFormError] = useState('');

  const weekDates = getWeekDates(weekRef);
  const weekStart = toDateStr(weekDates[0]);
  const weekEnd = toDateStr(weekDates[6]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    const res = await getAllSlots();
    setLoadingSlots(false);
    if (res.success && res.data) {
      setSlots(res.data);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    const res = await getBookings();
    setLoadingBookings(false);
    if (res.success && res.data) {
      setBookings(res.data);
    }
  }, []);

  const loadRecurring = useCallback(async () => {
    setLoadingRecurring(true);
    const res = await getRecurring();
    setLoadingRecurring(false);
    if (res.success && res.data) {
      setRecurrings(res.data);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (tab === 'bookings') loadBookings();
    if (tab === 'recurring') loadRecurring();
    if (tab === 'settings') {
      getProfile().then(res => {
        if (res.success && res.data) {
          setSessionDuration(res.data.session_duration_minutes);
        }
      });
    }
  }, [tab, loadBookings, loadRecurring]);

  const handleLogout = async () => {
    await apiLogout();
    localStorage.removeItem('psi_token');
    localStorage.removeItem('psi_user');
    onLogout();
  };

  const handleToggleBlock = async (slot: SlotWithBooking) => {
    setActionError('');
    const newAvailable = slot.available === 1 ? 0 : 1;
    const res = await updateSlot(slot.id, newAvailable as 0 | 1);
    if (res.success) {
      setSlots((prev) =>
        prev.map((s) => (s.id === slot.id ? { ...s, available: newAvailable } : s)),
      );
    } else {
      setActionError(res.error ?? 'Error al actualizar el turno');
    }
  };

  const handleDelete = async (slotId: number) => {
    setActionError('');
    const res = await deleteSlot(slotId);
    if (res.success) {
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
    } else {
      setActionError(res.error ?? 'Error al eliminar el turno');
    }
  };

  const openBlockModal = (slot: SlotWithBooking) => {
    if (slot.available === 0) {
      // If it's already blocked, just unlock it immediately
      handleToggleBlock(slot);
    } else {
      // It's available, so open modal to block or assign
      setSelectedSlotForBlock(slot);
      setAssignForm({ patient_name: '', patient_email: '', patient_phone: '' });
      setAssignFormError('');
      setBlockModalOpen(true);
    }
  };

  const handleSimpleBlock = async () => {
    if (!selectedSlotForBlock) return;
    await handleToggleBlock(selectedSlotForBlock);
    setBlockModalOpen(false);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotForBlock) return;
    setAssignFormError('');

    // Attempt to book it directly, using our new admin bypass in the backend
    const res = await createBooking({
      slot_id: selectedSlotForBlock.id,
      ...assignForm,
    });

    if (res.success) {
      setBlockModalOpen(false);
      loadSlots(); // Refresh slots to show new booking
    } else {
      setAssignFormError(res.error ?? 'Error al asignar paciente');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');
    const res = await updateProfile({ session_duration_minutes: sessionDuration });
    if (res.success) {
      setSettingsSuccess('Duración de sesión actualizada correctamente.');
    } else {
      setSettingsError(res.error ?? 'Error al actualizar configuración');
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecurringFormError('');
    setRecurringFormSuccess('');
    const res = await createRecurring({
      ...recurringForm,
      frequency_weeks: Number(recurringForm.frequency_weeks),
    });
    if (res.success && res.data) {
      setRecurringFormSuccess(
        `Recurrencia creada. ${res.data.slots_created} turno(s) generado(s).`,
      );
      setRecurringForm({
        patient_name: '',
        patient_email: '',
        patient_phone: '',
        start_date: '',
        time: '',
        frequency_weeks: 1,
      });
      loadRecurring();
      loadSlots();
    } else {
      setRecurringFormError(res.error ?? 'Error al crear la recurrencia');
    }
  };

  const handleCancelRecurring = async (id: number) => {
    const res = await cancelRecurring(id);
    if (res.success) {
      setRecurrings((prev) => prev.filter((r) => r.id !== id));
      loadSlots();
    } else {
      setRecurringFormError(res.error ?? 'Error al cancelar la recurrencia');
    }
  };

  // Group slots by date for weekly view
  const slotsByDate: Record<string, SlotWithBooking[]> = {};
  slots.forEach((s) => {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  });

  const weekSlots = slots.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const weekSlotsByDate: Record<string, SlotWithBooking[]> = {};
  weekSlots.forEach((s) => {
    if (!weekSlotsByDate[s.date]) weekSlotsByDate[s.date] = [];
    weekSlotsByDate[s.date].push(s);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-800">TurnosPsi — Admin</h1>
              <p className="text-xs text-gray-500">{psychologist.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-6">
            {(
              [
                { id: 'agenda', label: 'Agenda' },
                { id: 'create', label: 'Crear turnos' },
                { id: 'bookings', label: 'Reservas' },
                { id: 'recurring', label: 'Recurrencias' },
                { id: 'settings', label: 'Configuración' },
              ] as { id: Tab; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {actionError}
          </div>
        )}

        {/* ── AGENDA TAB ─────────────────────────────────── */}
        {tab === 'agenda' && (
          <div className="space-y-4">
            {/* Week navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const d = new Date(weekRef);
                  d.setDate(d.getDate() - 7);
                  setWeekRef(d);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ←
              </button>
              <span className="text-sm font-medium text-gray-700">
                {weekStart} — {weekEnd}
              </span>
              <button
                onClick={() => {
                  const d = new Date(weekRef);
                  d.setDate(d.getDate() + 7);
                  setWeekRef(d);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                →
              </button>
              <button
                onClick={() => setWeekRef(new Date())}
                className="ml-2 text-xs text-blue-600 hover:underline"
              >
                Hoy
              </button>
            </div>

            {loadingSlots ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {weekDates.map((date) => {
                  const ds = toDateStr(date);
                  const daySlots = weekSlotsByDate[ds] ?? [];
                  const isToday = ds === new Date().toISOString().split('T')[0];

                  return (
                    <div key={ds} className="min-h-32">
                      <div
                        className={`text-center py-1 px-1 rounded-lg text-xs font-medium mb-1 ${isToday ? 'bg-blue-600 text-white' : 'text-gray-500'
                          }`}
                      >
                        {formatDate(ds)}
                      </div>
                      <div className="space-y-1">
                        {daySlots.map((slot) => {
                          const isBooked = slot.booking_id !== null;
                          const isBlocked = slot.available === 0 && !isBooked;

                          return (
                            <div
                              key={slot.id}
                              className={`rounded-lg px-1.5 py-1 text-xs border ${isBooked
                                ? 'bg-red-50 border-red-200 text-red-700'
                                : isBlocked
                                  ? 'bg-gray-100 border-gray-300 text-gray-500'
                                  : 'bg-green-50 border-green-200 text-green-700'
                                }`}
                            >
                              <div className="font-medium flex items-center gap-1">
                                {slot.start_time}
                                {slot.recurring_booking_id !== null && (
                                  <span title="Turno recurrente" className="opacity-60">↺</span>
                                )}
                              </div>
                              {isBooked && (
                                <div className="text-xs truncate" title={slot.patient_name ?? ''}>
                                  {slot.patient_name}
                                </div>
                              )}
                              {isBlocked && <div className="text-xs">Bloqueado</div>}
                              <div className="flex gap-1 mt-1">
                                {!isBooked && (
                                  <button
                                    onClick={() => openBlockModal(slot)}
                                    className="text-xs underline opacity-70 hover:opacity-100"
                                  >
                                    {isBlocked ? 'Liberar' : 'Bloquear'}
                                  </button>
                                )}
                                {!isBooked && (
                                  <button
                                    onClick={() => handleDelete(slot.id)}
                                    className="text-xs underline opacity-70 hover:opacity-100 text-red-500"
                                  >
                                    Borrar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 text-xs text-gray-500 pt-2 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-200 inline-block" /> Disponible
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-200 inline-block" /> Reservado
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Bloqueado
              </span>
              <span className="flex items-center gap-1">
                ↺ Recurrente
              </span>
            </div>
          </div>
        )}

        {/* ── RECURRING TAB ──────────────────────────────── */}
        {tab === 'recurring' && (
          <div className="space-y-8">
            {/* Create form */}
            <div className="max-w-lg">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Nueva recurrencia</h2>
              <form onSubmit={handleCreateRecurring} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del paciente</label>
                  <input
                    type="text"
                    required
                    value={recurringForm.patient_name}
                    onChange={(e) => setRecurringForm((f) => ({ ...f, patient_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={recurringForm.patient_email}
                    onChange={(e) => setRecurringForm((f) => ({ ...f, patient_email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="paciente@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    required
                    value={recurringForm.patient_phone}
                    onChange={(e) => setRecurringForm((f) => ({ ...f, patient_phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+5491112345678"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                    <input
                      type="date"
                      required
                      value={recurringForm.start_date}
                      onChange={(e) => setRecurringForm((f) => ({ ...f, start_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                    <input
                      type="time"
                      required
                      value={recurringForm.time}
                      onChange={(e) => setRecurringForm((f) => ({ ...f, time: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia</label>
                  <select
                    value={recurringForm.frequency_weeks}
                    onChange={(e) =>
                      setRecurringForm((f) => ({ ...f, frequency_weeks: Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>Cada semana</option>
                    <option value={2}>Cada 2 semanas</option>
                    <option value={3}>Cada 3 semanas</option>
                    <option value={4}>Cada 4 semanas</option>
                  </select>
                </div>
                {recurringFormError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {recurringFormError}
                  </p>
                )}
                {recurringFormSuccess && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    {recurringFormSuccess}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Crear recurrencia
                </button>
              </form>
            </div>

            {/* Active recurrences list */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">Recurrencias activas</h2>
                <button onClick={loadRecurring} className="text-sm text-blue-600 hover:underline">
                  Actualizar
                </button>
              </div>
              {loadingRecurring ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : recurrings.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No hay recurrencias activas.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Paciente</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Frecuencia</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Desde</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Hora</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Próximo turno</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recurrings.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{r.patient_name}</div>
                            <div className="text-xs text-gray-400">{r.patient_email}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {r.frequency_weeks === 1
                              ? 'Semanal'
                              : `Cada ${r.frequency_weeks} semanas`}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(r.start_date)}</td>
                          <td className="px-4 py-3 text-gray-500">{r.time}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {r.next_appointment ? formatDate(r.next_appointment) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Cancelar toda la recurrencia de ${r.patient_name}? Se eliminarán todos los turnos futuros.`,
                                  )
                                ) {
                                  handleCancelRecurring(r.id);
                                }
                              }}
                              className="text-xs text-red-500 hover:underline font-medium"
                            >
                              Cancelar recurrencia
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CREATE TAB ─────────────────────────────────── */}
        {tab === 'create' && (
          <div className="max-w-lg">
            <SlotForm onCreated={loadSlots} sessionDuration={sessionDuration} />
          </div>
        )}

        {/* ── BOOKINGS TAB ───────────────────────────────── */}
        {tab === 'bookings' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Todas las reservas</h2>
              <button
                onClick={loadBookings}
                className="text-sm text-blue-600 hover:underline"
              >
                Actualizar
              </button>
            </div>

            {loadingBookings ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bookings.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No hay reservas registradas.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Paciente</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Turno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{b.patient_name}</td>
                        <td className="px-4 py-3 text-gray-500">{b.patient_email}</td>
                        <td className="px-4 py-3 text-gray-500">{b.patient_phone}</td>
                        <td className="px-4 py-3 text-gray-500">
                          <span className="capitalize">{formatDate(b.date)}</span>
                          {' '}·{' '}
                          {b.start_time}–{b.end_time}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ───────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-lg">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Configuración de Agenda</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duración de la sesión (minutos)</label>
                <select
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={50}>50 minutos</option>
                  <option value={60}>60 minutos (1 hora)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Esta duración se usará al crear nuevos turnos y recurrencias.</p>
              </div>
              {settingsError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {settingsError}
                </p>
              )}
              {settingsSuccess && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  {settingsSuccess}
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Guardar configuración
              </button>
            </form>
          </div>
        )}
      </main>

      {/* BLOCK / ASSIGN MODAL */}
      {blockModalOpen && selectedSlotForBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Gestionar Turno: {formatDate(selectedSlotForBlock.date)} {selectedSlotForBlock.start_time}</h3>
              <button
                onClick={() => setBlockModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                X
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              {/* Option A */}
              <div className="flex flex-col">
                <h4 className="font-bold text-gray-800 mb-2">Bloquear turno</h4>
                <p className="text-sm text-gray-500 mb-6 flex-1">
                  El psicólogo no está disponible en este horario. Nadie podrá reservar este turno.
                </p>
                <button
                  onClick={handleSimpleBlock}
                  className="w-full bg-gray-100 text-gray-800 rounded-xl py-2 px-4 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Bloquear
                </button>
              </div>

              {/* Option B */}
              <div className="flex flex-col pt-6 md:pt-0 md:pl-8">
                <h4 className="font-bold text-gray-800 mb-2">Asignar paciente</h4>
                <p className="text-sm text-gray-500 mb-4">
                  Registrá un paciente que ya coordinó por WhatsApp u otro medio.
                </p>

                <form onSubmit={handleAssignSubmit} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Nombre completo"
                      value={assignForm.patient_name}
                      onChange={e => setAssignForm(f => ({ ...f, patient_name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      required
                      placeholder="Email (ej: juan@email.com)"
                      value={assignForm.patient_email}
                      onChange={e => setAssignForm(f => ({ ...f, patient_email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Teléfono (+549...)"
                      value={assignForm.patient_phone}
                      onChange={e => setAssignForm(f => ({ ...f, patient_phone: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {assignFormError && (
                    <p className="text-xs text-red-600 mt-2">{assignFormError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white rounded-xl py-2 px-4 text-sm font-medium hover:bg-blue-700 transition-colors mt-2"
                  >
                    Asignar
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
