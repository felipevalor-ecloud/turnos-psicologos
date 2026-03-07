import { useState, useEffect, useCallback, useRef } from 'react';
import { SlotGrid } from '../components/SlotGrid';
import { BookingModal } from '../components/BookingModal';
import { BottomSheet } from '../components/BottomSheet';
import { WeekStrip } from '../components/WeekStrip';
import {
  getSlots, searchMyBookings, cancelBooking, rescheduleBooking,
  rescheduleRecurring, cancelRecurring, getContact,
} from '../lib/api';
import type { Slot, BookingResult, BookingWithSlot } from '../lib/types';

const WHATSAPP_CONTACT = '5491112345678';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function generateNext14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

type CancelConfirm = {
  bookingId: number;
  recurringId: number | null;
  step: 'choice' | 'confirm';
  isSeries: boolean;
  date: string;
};

type OutsidePolicyModal = {
  action: 'cancel' | 'reschedule';
  policyHours: number;
  whatsapp: string | null;
  psychologistName: string;
  date: string;
};

type PsychologistContact = { nombre: string; whatsapp_number: string | null };

export function PatientView() {
  const today = new Date().toISOString().split('T')[0];
  const stripDates = generateNext14Days();

  // Booking section
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<BookingResult | null>(null);
  const [showMySessions, setShowMySessions] = useState(false);

  // Search/My sessions
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelPhone, setCancelPhone] = useState('');
  const [myBookings, setMyBookings] = useState<BookingWithSlot[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [cancelMsg, setCancelMsg] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  const [psychologistContact, setPsychologistContact] = useState<PsychologistContact | null>(null);

  // Cancel flow
  const [showCancelConfirm, setShowCancelConfirm] = useState<CancelConfirm | null>(null);
  const [outsidePolicyModal, setOutsidePolicyModal] = useState<OutsidePolicyModal | null>(null);
  const [bookingWarning, setBookingWarning] = useState<{ policyHours: number } | null>(null);

  // Reschedule flow
  const [reschedulingBooking, setReschedulingBooking] = useState<BookingWithSlot | null>(null);
  const [rescheduleStep, setRescheduleStep] = useState<'choice' | 'slots' | 'series-time' | 'confirm'>('choice');
  const [rescheduleType, setRescheduleType] = useState<'single' | 'series'>('single');
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [rescheduleLoadingSlots, setRescheduleLoadingSlots] = useState(false);
  const [rescheduleSelectedSlot, setRescheduleSelectedSlot] = useState<Slot | null>(null);
  const [rescheduleSeriesTime, setRescheduleSeriesTime] = useState('');
  const [rescheduleSeriesFromDate, setRescheduleSeriesFromDate] = useState(today);
  const [rescheduleError, setRescheduleError] = useState('');

  const datePickerRef = useRef<HTMLInputElement>(null);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    const res = await getSlots(selectedDate);
    setLoadingSlots(false);
    if (res.success && res.data) {
      let fetched = res.data;
      if (selectedDate === today) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        fetched = fetched.filter(s => s.start_time > currentTime);
      }
      setSlots(fetched);
    }
  }, [selectedDate, today]);

  useEffect(() => {
    setBookingSuccess(null);
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    getContact().then(res => { if (res.success && res.data) setPsychologistContact(res.data); });
  }, []);

  const handleBookingSuccess = (result: BookingResult, warning?: string, policyHours?: number) => {
    setSelectedSlot(null);
    setBookingSuccess(result);
    setBookingWarning(warning === 'outside_policy' ? { policyHours: policyHours ?? 24 } : null);
    loadSlots();
  };

  const handleSearchBookings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setMyBookings(null);
    setCancelMsg('');
    if (!cancelEmail && !cancelPhone) {
      setSearchError('Ingresá tu email o teléfono');
      return;
    }
    setSearchLoading(true);
    const res = await searchMyBookings(cancelEmail, cancelPhone);
    setSearchLoading(false);
    if (res.success && res.data) {
      setMyBookings(res.data);
      if (res.data.length === 0) setSearchError('No se encontraron sesiones activas con esos datos.');
    } else {
      setSearchError(res.error ?? 'Error al buscar sesiones');
    }
  };

  // ── Cancel ──────────────────────────────────────────────────────────────────

  const openCancel = (booking: BookingWithSlot) => {
    if (booking.recurring_booking_id) {
      setShowCancelConfirm({ bookingId: booking.id, recurringId: booking.recurring_booking_id, step: 'choice', isSeries: false, date: booking.date });
    } else {
      setShowCancelConfirm({ bookingId: booking.id, recurringId: null, step: 'confirm', isSeries: false, date: booking.date });
    }
  };

  const handleCancel = async () => {
    if (!showCancelConfirm) return;
    const { bookingId, recurringId, isSeries, date } = showCancelConfirm;
    setCancelLoading(true);
    setCancelMsg('');

    const emailArg = cancelEmail || undefined;
    const phoneArg = cancelPhone || undefined;

    const res = (isSeries && recurringId !== null)
      ? await cancelRecurring(recurringId, emailArg, phoneArg)
      : await cancelBooking(bookingId, emailArg, phoneArg);

    setCancelLoading(false);
    setShowCancelConfirm(null);

    if (!res.success && res.error === 'outside_policy') {
      setOutsidePolicyModal({ action: 'cancel', policyHours: res.policy_hours ?? 48, whatsapp: res.whatsapp_number ?? null, psychologistName: res.psychologist_name ?? psychologistContact?.nombre ?? '', date });
      return;
    }

    if (res.success) {
      setCancelMsg('Tu sesión fue cancelada.');
      if (isSeries && recurringId !== null) {
        setMyBookings(prev => prev ? prev.filter(b => b.recurring_booking_id !== recurringId) : []);
      } else {
        setMyBookings(prev => prev ? prev.filter(b => b.id !== bookingId) : []);
      }
      loadSlots();
    } else {
      setCancelMsg(res.error ?? 'Error al cancelar');
    }
  };

  // ── Reschedule ──────────────────────────────────────────────────────────────

  const loadRescheduleSlots = async (date: string) => {
    setRescheduleLoadingSlots(true);
    const res = await getSlots(date);
    setRescheduleLoadingSlots(false);
    if (res.success && res.data) {
      let fetched = res.data;
      if (date === today) {
        const nowBA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Buenos_Aires' }));
        const currentTime = `${String(nowBA.getHours()).padStart(2, '0')}:${String(nowBA.getMinutes()).padStart(2, '0')}`;
        fetched = fetched.filter(s => s.start_time > currentTime);
      }
      setRescheduleSlots(fetched);
    }
  };

  const handleStartReschedule = (booking: BookingWithSlot) => {
    setReschedulingBooking(booking);
    setRescheduleError('');
    setRescheduleDate(today);
    setRescheduleSelectedSlot(null);
    setRescheduleSeriesTime('');
    setRescheduleSeriesFromDate(booking.date);
    if (booking.recurring_booking_id) {
      setRescheduleStep('choice');
    } else {
      setRescheduleType('single');
      loadRescheduleSlots(today);
      setRescheduleStep('slots');
    }
  };

  const handleReschedule = async () => {
    if (!reschedulingBooking) return;
    setCancelLoading(true);
    setRescheduleError('');

    const emailArg = cancelEmail || undefined;
    const phoneArg = cancelPhone || undefined;

    let res;
    if (rescheduleType === 'series') {
      res = await rescheduleRecurring(reschedulingBooking.recurring_booking_id!, {
        email: emailArg,
        phone: phoneArg,
        from_date: rescheduleSeriesFromDate,
        new_time: rescheduleSeriesTime,
      });
    } else {
      if (!rescheduleSelectedSlot) { setCancelLoading(false); return; }
      res = await rescheduleBooking(reschedulingBooking.id, {
        email: emailArg,
        phone: phoneArg,
        new_slot_id: rescheduleSelectedSlot.id,
      });
    }

    setCancelLoading(false);

    if (!res.success && res.error === 'outside_policy') {
      setReschedulingBooking(null);
      setOutsidePolicyModal({ action: 'reschedule', policyHours: res.policy_hours ?? 48, whatsapp: res.whatsapp_number ?? null, psychologistName: res.psychologist_name ?? psychologistContact?.nombre ?? '', date: reschedulingBooking.date });
      return;
    }

    if (res.success) {
      setReschedulingBooking(null);
      setCancelMsg(
        rescheduleType === 'series'
          ? 'Tus sesiones fueron reprogramadas exitosamente'
          : 'Tu sesión fue cambiada exitosamente',
      );
      handleSearchBookings({ preventDefault: () => {} } as React.FormEvent);
      loadSlots();
    } else {
      setRescheduleError(res.error ?? 'Error al reprogramar');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header + week strip */}
      <header className="bg-[#1a2e4a] text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Turnos Psico</h1>
              <p className="text-[11px] text-white/60">Agendá tu sesión</p>
            </div>
          </div>
          <a href="/admin" className="text-white border border-white/40 hover:border-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors">
            Soy Psicólogo
          </a>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-4 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <WeekStrip dates={stripDates} selectedDate={selectedDate} onSelect={setSelectedDate} />
          </div>
          <div className="relative flex-none">
            <button
              onClick={() => datePickerRef.current?.showPicker()}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Elegir fecha"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <input
              ref={datePickerRef}
              type="date"
              min={today}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Booking success banner */}
        {bookingSuccess && (
          <div className="bg-[#4caf7d]/10 border border-[#4caf7d]/30 rounded-2xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[#1e6e44] text-sm">¡Sesión confirmada!</p>
              <p className="text-sm text-[#1e6e44] mt-0.5 capitalize">
                {formatDateShort(bookingSuccess.slot.date)} · {bookingSuccess.slot.start_time} – {bookingSuccess.slot.end_time}
              </p>
              <p className="text-xs text-[#1e6e44]/70 mt-0.5">A nombre de {bookingSuccess.patient.name}</p>
              {bookingWarning && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
                  Nota: esta sesión está dentro del plazo mínimo de {bookingWarning.policyHours}hs. El psicólogo podría no poder confirmarla. Si tenés dudas, contactalo directamente.
                </p>
              )}
            </div>
            <button onClick={() => { setBookingSuccess(null); setBookingWarning(null); }} className="text-[#1e6e44]/60 hover:text-[#1e6e44] mt-0.5 flex-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Slots section */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-slate-50">
            <h2 className="text-base font-bold text-[#1a2e4a] capitalize">
              {selectedDate === today ? 'Hoy' : formatDateShort(selectedDate)}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{formatDate(selectedDate)}</p>
          </div>
          <div className="p-5">
            <SlotGrid slots={slots} onSelect={setSelectedSlot} loading={loadingSlots} />
          </div>
        </section>

        {/* Mis sesiones (collapsible) */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <button
            onClick={() => setShowMySessions(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4"
          >
            <div className="text-left">
              <h2 className="text-base font-bold text-[#1a2e4a]">Mis sesiones</h2>
              <p className="text-xs text-slate-400">Ver y gestionar tus sesiones</p>
            </div>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform flex-none ${showMySessions ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMySessions && (
            <div className="px-5 pb-5 border-t border-slate-50">
              <form onSubmit={handleSearchBookings} className="space-y-3 pt-4">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={cancelEmail}
                  onChange={(e) => setCancelEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <input
                  type="tel"
                  placeholder="+5491112345678"
                  value={cancelPhone}
                  onChange={(e) => setCancelPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="w-full bg-[#1a2e4a] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
                >
                  {searchLoading ? 'Buscando...' : 'Buscar mis sesiones'}
                </button>
              </form>

              {searchError && <p className="mt-3 text-sm text-red-500">{searchError}</p>}

              {cancelMsg && (
                <div className="mt-3 p-4 bg-[#4caf7d]/10 border border-[#4caf7d]/20 rounded-xl space-y-2">
                  <p className="text-sm text-[#1e6e44]">{cancelMsg}</p>
                  {cancelMsg.includes('cancelada') && (
                    <a
                      href={`https://wa.me/${WHATSAPP_CONTACT}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1e6e44] underline"
                    >
                      Avisar por WhatsApp
                    </a>
                  )}
                </div>
              )}

              {myBookings && myBookings.length > 0 && (
                <div className="mt-4 space-y-3">
                  {myBookings.map((b) => (
                    <div key={b.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-[#1a2e4a] capitalize">{formatDateShort(b.date)}</p>
                          {b.recurring_booking_id && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                              ↺ Recurrente
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 font-medium">{b.start_time} – {b.end_time}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleStartReschedule(b)}
                          className="text-xs bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 font-semibold"
                        >
                          Reprogramar
                        </button>
                        <button
                          onClick={() => openCancel(b)}
                          className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1.5"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Booking Modal */}
      {selectedSlot && (
        <BookingModal slot={selectedSlot} onClose={() => setSelectedSlot(null)} onSuccess={handleBookingSuccess} />
      )}

      {/* Outside policy modal */}
      <BottomSheet
        isOpen={outsidePolicyModal !== null}
        onClose={() => setOutsidePolicyModal(null)}
        title="No podés gestionar esta sesión"
      >
        {outsidePolicyModal && (
          <div>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Esta sesión está a menos de{' '}
              <span className="font-bold text-slate-800">{outsidePolicyModal.policyHours} horas</span>.
              Para {outsidePolicyModal.action === 'cancel' ? 'cancelar' : 'reagendar'}, contactá a tu psicólogo.
            </p>
            <div className="flex flex-col gap-2">
              {outsidePolicyModal.whatsapp && (
                <a
                  href={`https://wa.me/${outsidePolicyModal.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${outsidePolicyModal.psychologistName}, ¿cómo andás? Te escribo para avisarte que quiero ${outsidePolicyModal.action === 'cancel' ? 'cancelar' : 'reagendar'} nuestra sesión del ${formatDate(outsidePolicyModal.date)}. ¡Gracias!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#25d366] text-white py-3.5 rounded-xl font-bold hover:bg-[#1ebe5d] transition-colors text-center text-sm"
                >
                  Contactar por WhatsApp
                </a>
              )}
              <button
                onClick={() => setOutsidePolicyModal(null)}
                className="w-full bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Cancel Bottom Sheet */}
      <BottomSheet
        isOpen={showCancelConfirm !== null}
        onClose={() => setShowCancelConfirm(null)}
        title={showCancelConfirm?.step === 'choice' ? 'Cancelar sesión' : 'Confirmar cancelación'}
      >
        {showCancelConfirm && (
          <div>
            {showCancelConfirm.step === 'choice' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 mb-4">¿Qué querés cancelar?</p>
                <button
                  onClick={() => setShowCancelConfirm({ ...showCancelConfirm, step: 'confirm', isSeries: false })}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-[#1a2e4a]/40 hover:bg-[#1a2e4a]/5 transition-all"
                >
                  <p className="font-bold text-[#1a2e4a] text-sm">Solo esta sesión</p>
                  <p className="text-xs text-slate-500 mt-0.5">Las demás sesiones de la serie no se verán afectadas</p>
                </button>
                <button
                  onClick={() => setShowCancelConfirm({ ...showCancelConfirm, step: 'confirm', isSeries: true })}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-all"
                >
                  <p className="font-bold text-red-600 text-sm">Esta y todas las futuras</p>
                  <p className="text-xs text-slate-500 mt-0.5">Se cancelará toda la recurrencia desde esta fecha</p>
                </button>
              </div>
            )}

            {showCancelConfirm.step === 'confirm' && (
              <div>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  {showCancelConfirm.isSeries
                    ? '¿Querés cancelar esta y todas las sesiones futuras de la recurrencia?'
                    : '¿Querés cancelar esta sesión?'}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="w-full bg-red-500 text-white py-3.5 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {cancelLoading ? 'Cancelando...' : 'Sí, cancelar'}
                  </button>
                  {psychologistContact?.whatsapp_number && (
                    <a
                      href={`https://wa.me/${psychologistContact.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${psychologistContact.nombre}, ¿cómo andás? Te escribo para avisarte que quiero cancelar nuestra sesión del ${formatDate(showCancelConfirm.date)}. ¡Gracias!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#25d366] text-white py-3.5 rounded-xl font-bold hover:bg-[#1ebe5d] transition-colors text-center text-sm"
                    >
                      Contactar por WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() =>
                      showCancelConfirm.recurringId
                        ? setShowCancelConfirm({ ...showCancelConfirm, step: 'choice' })
                        : setShowCancelConfirm(null)
                    }
                    className="w-full bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Reschedule Bottom Sheet */}
      <BottomSheet
        isOpen={reschedulingBooking !== null}
        onClose={() => setReschedulingBooking(null)}
        title="Reprogramar sesión"
      >
        {reschedulingBooking && (
          <div>
            {/* Current session summary */}
            <div className="mb-5 p-4 bg-[#1a2e4a]/5 rounded-xl border border-[#1a2e4a]/10">
              <p className="text-[10px] text-[#1a2e4a]/50 font-bold uppercase mb-1">Sesión actual</p>
              <p className="text-sm text-[#1a2e4a] font-bold capitalize">{formatDate(reschedulingBooking.date)}</p>
              <p className="text-xs text-[#1a2e4a]/70 font-medium">{reschedulingBooking.start_time} – {reschedulingBooking.end_time}</p>
            </div>

            {/* Step: choice (recurring only) */}
            {rescheduleStep === 'choice' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 mb-4">¿Qué querés cambiar?</p>
                <button
                  onClick={() => { setRescheduleType('single'); loadRescheduleSlots(rescheduleDate); setRescheduleStep('slots'); }}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-[#1a2e4a]/40 hover:bg-[#1a2e4a]/5 transition-all"
                >
                  <p className="font-bold text-[#1a2e4a] text-sm">Solo esta sesión</p>
                  <p className="text-xs text-slate-500 mt-0.5">Las sesiones futuras no se verán afectadas</p>
                </button>
                <button
                  onClick={() => { setRescheduleType('series'); setRescheduleStep('series-time'); }}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-[#1a2e4a]/40 hover:bg-[#1a2e4a]/5 transition-all"
                >
                  <p className="font-bold text-[#1a2e4a] text-sm">Esta y todas las futuras</p>
                  <p className="text-xs text-slate-500 mt-0.5">Se cambiará el horario de toda la serie a partir de esta fecha</p>
                </button>
              </div>
            )}

            {/* Step: slots (single reschedule) */}
            {rescheduleStep === 'slots' && (
              <div className="space-y-4">
                <label className="block text-sm font-bold text-[#1a2e4a]">Elegí la nueva fecha</label>
                <input
                  type="date"
                  min={today}
                  value={rescheduleDate}
                  onChange={(e) => { setRescheduleDate(e.target.value); loadRescheduleSlots(e.target.value); }}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <SlotGrid
                  slots={rescheduleSlots}
                  loading={rescheduleLoadingSlots}
                  onSelect={(s) => { setRescheduleSelectedSlot(s); setRescheduleStep('confirm'); }}
                />
                {rescheduleError && <p className="text-sm text-red-500 font-medium">{rescheduleError}</p>}
                {reschedulingBooking.recurring_booking_id && (
                  <button
                    onClick={() => setRescheduleStep('choice')}
                    className="text-sm text-slate-500 py-2 hover:text-slate-700 font-medium"
                  >
                    ← Volver
                  </button>
                )}
              </div>
            )}

            {/* Step: series-time (series reschedule — date + time picker) */}
            {rescheduleStep === 'series-time' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#1a2e4a] mb-1.5">Desde qué fecha</label>
                  <input
                    type="date"
                    min={today}
                    value={rescheduleSeriesFromDate}
                    onChange={(e) => setRescheduleSeriesFromDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#1a2e4a] mb-1.5">Nuevo horario</label>
                  <input
                    type="time"
                    value={rescheduleSeriesTime}
                    onChange={(e) => setRescheduleSeriesTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Todas las sesiones de la serie a partir del{' '}
                  <span className="font-semibold capitalize">{formatDate(rescheduleSeriesFromDate)}</span>{' '}
                  cambiarán a este horario.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { if (rescheduleSeriesTime) setRescheduleStep('confirm'); }}
                    disabled={!rescheduleSeriesTime}
                    className="w-full bg-[#1a2e4a] text-white py-3.5 rounded-xl font-bold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
                  >
                    Continuar
                  </button>
                  <button
                    onClick={() => setRescheduleStep('choice')}
                    className="text-sm text-slate-500 py-2 hover:text-slate-700 font-medium"
                  >
                    Volver
                  </button>
                </div>
                {rescheduleError && <p className="text-sm text-red-500 font-medium">{rescheduleError}</p>}
              </div>
            )}

            {/* Step: confirm */}
            {rescheduleStep === 'confirm' && (rescheduleType === 'single' ? rescheduleSelectedSlot : rescheduleSeriesTime) && (
              <div className="space-y-5">
                <div className="flex items-center justify-center gap-8 py-4">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Antes</p>
                    <p className="text-xl font-bold text-slate-300 line-through">{reschedulingBooking.start_time}</p>
                  </div>
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Nuevo</p>
                    <p className="text-2xl font-bold text-[#1a2e4a]">
                      {rescheduleType === 'single' ? rescheduleSelectedSlot!.start_time : rescheduleSeriesTime}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 text-center leading-relaxed">
                  {rescheduleType === 'series'
                    ? <>Esta y todas las sesiones futuras desde <span className="font-bold text-slate-700 capitalize">{formatDate(rescheduleSeriesFromDate)}</span> cambiarán de horario.</>
                    : <>Sesión del <span className="font-bold text-slate-700 capitalize">{formatDate(rescheduleDate)}</span>.</>
                  }
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleReschedule}
                    disabled={cancelLoading}
                    className="w-full bg-[#1a2e4a] text-white py-3.5 rounded-xl font-bold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
                  >
                    {cancelLoading ? 'Procesando...' : 'Confirmar cambio'}
                  </button>
                  {psychologistContact?.whatsapp_number && (
                    <a
                      href={`https://wa.me/${psychologistContact.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${psychologistContact.nombre}, ¿cómo andás? Te escribo para avisarte que quiero reagendar nuestra sesión del ${formatDate(reschedulingBooking.date)}. ¡Gracias!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#25d366] text-white py-3.5 rounded-xl font-bold hover:bg-[#1ebe5d] transition-colors text-center text-sm"
                    >
                      Contactar por WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => setRescheduleStep(rescheduleType === 'series' ? 'series-time' : 'slots')}
                    className="text-sm text-slate-500 py-2 hover:text-slate-700 font-medium"
                  >
                    Volver
                  </button>
                </div>
                {rescheduleError && <p className="text-sm text-red-500 font-medium mt-2">{rescheduleError}</p>}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
