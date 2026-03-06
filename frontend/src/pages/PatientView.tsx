import { useState, useEffect, useCallback } from 'react';
import { SlotGrid } from '../components/SlotGrid';
import { BookingModal } from '../components/BookingModal';
import { getSlots, searchMyBookings, cancelBooking, rescheduleBooking, rescheduleRecurring, cancelRecurring } from '../lib/api';
import type { Slot, BookingResult, BookingWithSlot } from '../lib/types';

const WHATSAPP_CONTACT = '5491112345678'; // Configurable phone number

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function PatientView() {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResult | null>(null);

  // Search/Cancel section
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelPhone, setCancelPhone] = useState('+549');
  const [myBookings, setMyBookings] = useState<BookingWithSlot[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [cancelMsg, setCancelMsg] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Reschedule section
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingWithSlot | null>(null);
  const [rescheduleStep, setRescheduleStep] = useState<'choice' | 'date' | 'slots' | 'confirm'>('choice');
  const [rescheduleType, setRescheduleType] = useState<'single' | 'series'>('single');
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [rescheduleLoadingSlots, setRescheduleLoadingSlots] = useState(false);
  const [rescheduleSelectedSlot, setRescheduleSelectedSlot] = useState<Slot | null>(null);
  const [rescheduleError, setRescheduleError] = useState('');

  // Modals
  const [showCancelConfirm, setShowCancelConfirm] = useState<{ id: number; recurring: boolean; series: boolean } | null>(null);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    const res = await getSlots(selectedDate);
    setLoadingSlots(false);
    if (res.success && res.data) {
      setSlots(res.data);
    }
  }, [selectedDate]);

  useEffect(() => {
    setBookingSuccess(null);
    loadSlots();
  }, [loadSlots]);

  const handleBookingSuccess = (result: BookingResult) => {
    setSelectedSlot(null);
    setBookingSuccess(result);
    loadSlots();
  };

  const handleSearchBookings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setMyBookings(null);
    setCancelMsg('');
    setSearchLoading(true);

    const res = await searchMyBookings(cancelEmail, cancelPhone);
    setSearchLoading(false);

    if (res.success && res.data) {
      setMyBookings(res.data);
      if (res.data.length === 0) {
        setSearchError('No se encontraron reservas activas con esos datos.');
      }
    } else {
      setSearchError(res.error ?? 'Error al buscar reservas');
    }
  };

  const handleCancel = async (bookingId: number) => {
    const isSeries = showCancelConfirm?.series ?? false;
    setCancelLoading(true);
    setCancelMsg('');

    let res;
    if (isSeries) {
      res = await cancelRecurring(bookingId, cancelEmail, cancelPhone);
    } else {
      res = await cancelBooking(bookingId, cancelEmail, cancelPhone);
    }
    setCancelLoading(false);
    setShowCancelConfirm(null);

    if (res.success) {
      setCancelMsg(
        `Tu turno fue cancelado. Si fue a último momento, avisale a tu psicólogo por WhatsApp 👉 [Enviar mensaje](https://wa.me/${WHATSAPP_CONTACT})`
      );
      if (isSeries) {
        const targetRecurringId = myBookings?.find(m => m.id === bookingId)?.recurring_booking_id;
        setMyBookings((prev) => (prev ? prev.filter((b) => b.recurring_booking_id !== targetRecurringId) : []));
      } else {
        setMyBookings((prev) => (prev ? prev.filter((b) => b.id !== bookingId) : []));
      }
      if (selectedDate) loadSlots();
    } else {
      setCancelMsg(res.error ?? 'Error al cancelar');
    }
  };

  const handleStartReschedule = (booking: BookingWithSlot) => {
    setReschedulingBooking(booking);
    setRescheduleError('');
    if (booking.recurring_booking_id) {
      setRescheduleStep('choice');
    } else {
      setRescheduleType('single');
      setRescheduleStep('date');
    }
    setRescheduleDate(today);
  };

  const loadRescheduleSlots = async (date: string) => {
    setRescheduleLoadingSlots(true);
    const res = await getSlots(date);
    setRescheduleLoadingSlots(false);
    if (res.success && res.data) {
      setRescheduleSlots(res.data);
    }
  };

  const handleReschedule = async () => {
    if (!reschedulingBooking || (rescheduleStep === 'slots' && !rescheduleSelectedSlot)) return;

    setCancelLoading(true);
    setRescheduleError('');

    let res;
    if (rescheduleType === 'single') {
      res = await rescheduleBooking(reschedulingBooking.id, {
        email: cancelEmail,
        phone: cancelPhone,
        new_slot_id: rescheduleSelectedSlot!.id,
      });
    } else {
      res = await rescheduleRecurring(reschedulingBooking.recurring_booking_id!, {
        email: cancelEmail,
        phone: cancelPhone,
        from_date: reschedulingBooking.date,
        new_time: rescheduleSelectedSlot!.start_time,
      });
    }

    setCancelLoading(false);

    if (res.success) {
      setReschedulingBooking(null);
      setCancelMsg('Tu turno fue cambiado exitosamente');
      // Refresh bookings list
      handleSearchBookings({ preventDefault: () => { } } as any);
      if (selectedDate) loadSlots();
    } else {
      setRescheduleError(res.error ?? 'Error al reprogramar');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">TurnosPsi</h1>
            <p className="text-xs text-gray-500">Reservá tu turno de psicología</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Booking success */}
        {bookingSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h3 className="font-semibold text-green-800 mb-1">¡Turno reservado!</h3>
            <p className="text-sm text-green-700 font-medium">
              <span className="capitalize">{formatDate(bookingSuccess.slot.date)}</span>
              {' '}·{' '}
              {bookingSuccess.slot.start_time} – {bookingSuccess.slot.end_time}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Reserva a nombre de <strong>{bookingSuccess.patient.name}</strong>
            </p>
            <button
              onClick={() => setBookingSuccess(null)}
              className="mt-3 text-xs text-green-700 underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Date picker + slots */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Elegí una fecha</h2>
          <input
            type="date"
            min={today}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-xl px-4 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {selectedDate && (
            <>
              <p className="text-sm text-gray-500 mb-3 capitalize font-medium">{formatDate(selectedDate)}</p>
              <SlotGrid slots={slots} onSelect={setSelectedSlot} loading={loadingSlots} />
            </>
          )}
        </section>

        {/* Search / My Bookings */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Mis turnos</h2>
          <p className="text-sm text-gray-500 mb-4">Ingresá tu email y teléfono para ver y gestionar tus turnos.</p>

          <form onSubmit={handleSearchBookings} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                required
                placeholder="tu@email.com"
                value={cancelEmail}
                onChange={(e) => setCancelEmail(e.target.value)}
                className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="tel"
                required
                placeholder="+5491112345678"
                value={cancelPhone}
                onChange={(e) => setCancelPhone(e.target.value)}
                className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading}
              className="bg-gray-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {searchLoading ? 'Buscando...' : 'Buscar mis turnos'}
            </button>
          </form>

          {searchError && <p className="mt-3 text-sm text-red-500">{searchError}</p>}
          {cancelMsg && (
            <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-700 whitespace-pre-line">{cancelMsg}</p>
            </div>
          )}

          {myBookings && myBookings.length > 0 && (
            <div className="mt-4 space-y-3">
              {myBookings.map((b) => (
                <div key={b.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800 capitalize">{formatDate(b.date)}</p>
                        {b.recurring_booking_id && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            ↺ Turno recurrente
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 font-medium">{b.start_time} – {b.end_time}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {b.recurring_booking_id ? (
                      <>
                        <button onClick={() => { setRescheduleType('single'); handleStartReschedule(b); }} className="text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">Cambiar este turno</button>
                        <button onClick={() => { setRescheduleType('series'); handleStartReschedule(b); }} className="text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">Cambiar este y futuros</button>
                        <button onClick={() => setShowCancelConfirm({ id: b.id, recurring: true, series: false })} className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1.5">Cancelar este</button>
                        <button onClick={() => setShowCancelConfirm({ id: b.id, recurring: true, series: true })} className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1.5">Cancelar recurrencia</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleStartReschedule(b)} className="text-xs bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">Cambiar turno</button>
                        <button onClick={() => setShowCancelConfirm({ id: b.id, recurring: false, series: false })} className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1.5">Cancelar turno</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      {selectedSlot && <BookingModal slot={selectedSlot} onClose={() => setSelectedSlot(null)} onSuccess={handleBookingSuccess} />}

      {/* Reschedule Modal */}
      {reschedulingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Reprogramar turno</h3>
              <button onClick={() => setReschedulingBooking(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6">
              <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-[10px] text-blue-600 font-bold uppercase mb-1">Turno actual</p>
                <p className="text-sm text-blue-900 font-bold capitalize">{formatDate(reschedulingBooking.date)}</p>
                <p className="text-xs text-blue-700 font-medium">{reschedulingBooking.start_time} – {reschedulingBooking.end_time}</p>
              </div>

              {rescheduleStep === 'choice' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">¿Querés cambiar solo este turno o este y todos los futuros?</p>
                  <button onClick={() => { setRescheduleType('single'); setRescheduleStep('date'); }} className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                    <p className="font-bold text-gray-800 group-hover:text-blue-700">Solo este turno</p>
                    <p className="text-xs text-gray-500">Los turnos futuros de la serie no se verán afectados.</p>
                  </button>
                  <button onClick={() => { setRescheduleType('series'); setRescheduleStep('date'); }} className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                    <p className="font-bold text-gray-800 group-hover:text-blue-700">Este y todos los futuros</p>
                    <p className="text-xs text-gray-500">Se actualizará la hora de toda la serie recurrente.</p>
                  </button>
                </div>
              )}

              {rescheduleStep === 'date' && (
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-700">Elegí la nueva fecha</label>
                  <input
                    type="date"
                    min={today}
                    value={rescheduleDate}
                    onChange={(e) => { setRescheduleDate(e.target.value); loadRescheduleSlots(e.target.value); setRescheduleStep('slots'); }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end pt-2">
                    <button onClick={() => setReschedulingBooking(null)} className="text-sm text-gray-500 px-4 py-2 hover:text-gray-700 font-medium">Cancelar</button>
                  </div>
                </div>
              )}

              {rescheduleStep === 'slots' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-700 capitalize">{formatDate(rescheduleDate)}</p>
                    <button onClick={() => setRescheduleStep('date')} className="text-xs text-blue-600 font-bold">Cambiar fecha</button>
                  </div>
                  <SlotGrid slots={rescheduleSlots} loading={rescheduleLoadingSlots} onSelect={(s) => { setRescheduleSelectedSlot(s); setRescheduleStep('confirm'); }} />
                  {rescheduleError && <p className="text-sm text-red-500 mt-2 font-medium">{rescheduleError}</p>}
                </div>
              )}

              {rescheduleStep === 'confirm' && rescheduleSelectedSlot && (
                <div className="space-y-6 text-center">
                  <div className="flex items-center justify-center gap-4 py-4">
                    <div className="opacity-40 line-through text-sm font-medium">{reschedulingBooking.start_time}</div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    <div className="text-2xl font-bold text-blue-600">{rescheduleSelectedSlot.start_time}</div>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Vas a reprogramar el turno del <span className="font-bold text-gray-700 capitalize">{formatDate(rescheduleDate)}</span>.
                    {rescheduleType === 'series' && " Esto afectará a toda la recurrencia."}
                  </p>
                  <div className="flex flex-col gap-2 pt-2">
                    <button onClick={handleReschedule} disabled={cancelLoading} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200">
                      {cancelLoading ? 'Procesando...' : 'Confirmar cambio'}
                    </button>
                    <button onClick={() => setRescheduleStep('slots')} className="text-sm text-gray-500 py-2 hover:text-gray-700 font-medium">Volver</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">¿Seguro que querés cancelar?</h3>
            <p className="text-sm text-gray-600 mb-6 font-medium leading-relaxed">
              {showCancelConfirm.series
                ? "¿Seguro que querés cancelar todos tus turnos futuros de esta recurrencia?"
                : "¿Seguro que querés cancelar este turno?"}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleCancel(showCancelConfirm.id)} disabled={cancelLoading} className="w-full bg-red-600 text-white py-3.5 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {cancelLoading ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
              <button onClick={() => setShowCancelConfirm(null)} className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                Volver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
