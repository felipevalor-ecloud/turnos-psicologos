import { useState, useEffect, useCallback } from 'react';
import { SlotForm } from '../components/SlotForm';
import { getAllSlots, getBookings, updateSlot, deleteSlot, apiLogout } from '../lib/api';
import type { Psychologist, SlotWithBooking, BookingWithSlot } from '../lib/types';

type Tab = 'agenda' | 'create' | 'bookings';

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
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [actionError, setActionError] = useState('');

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

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (tab === 'bookings') loadBookings();
  }, [tab, loadBookings]);

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
              ] as { id: Tab; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === id
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
                        className={`text-center py-1 px-1 rounded-lg text-xs font-medium mb-1 ${
                          isToday ? 'bg-blue-600 text-white' : 'text-gray-500'
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
                              className={`rounded-lg px-1.5 py-1 text-xs border ${
                                isBooked
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : isBlocked
                                  ? 'bg-gray-100 border-gray-300 text-gray-500'
                                  : 'bg-green-50 border-green-200 text-green-700'
                              }`}
                            >
                              <div className="font-medium">{slot.start_time}</div>
                              {isBooked && (
                                <div className="text-xs truncate" title={slot.patient_name ?? ''}>
                                  {slot.patient_name}
                                </div>
                              )}
                              {isBlocked && <div className="text-xs">Bloqueado</div>}
                              <div className="flex gap-1 mt-1">
                                {!isBooked && (
                                  <button
                                    onClick={() => handleToggleBlock(slot)}
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
            <div className="flex gap-4 text-xs text-gray-500 pt-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-200 inline-block" /> Disponible
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-200 inline-block" /> Reservado
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Bloqueado
              </span>
            </div>
          </div>
        )}

        {/* ── CREATE TAB ─────────────────────────────────── */}
        {tab === 'create' && (
          <div className="max-w-lg">
            <SlotForm onCreated={loadSlots} />
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
      </main>
    </div>
  );
}
