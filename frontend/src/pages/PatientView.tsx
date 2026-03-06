import { useState, useEffect, useCallback } from 'react';
import { SlotGrid } from '../components/SlotGrid';
import { BookingModal } from '../components/BookingModal';
import { getSlots, searchMyBookings, cancelBooking } from '../lib/api';
import type { Slot, BookingResult, BookingWithSlot } from '../lib/types';

function formatDate(dateStr: string): string {
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

  // Cancel booking section
  const [cancelEmail, setCancelEmail] = useState('');
  const [cancelPhone, setCancelPhone] = useState('+549');
  const [myBookings, setMyBookings] = useState<BookingWithSlot[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [cancelMsg, setCancelMsg] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

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
    setCancelLoading(true);
    setCancelMsg('');

    const res = await cancelBooking(bookingId, cancelEmail, cancelPhone);
    setCancelLoading(false);

    if (res.success) {
      setCancelMsg('Turno cancelado correctamente.');
      setMyBookings((prev) => (prev ? prev.filter((b) => b.id !== bookingId) : []));
      if (selectedDate) loadSlots();
    } else {
      setCancelMsg(res.error ?? 'Error al cancelar');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
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
            <p className="text-sm text-green-700">
              <span className="capitalize">{formatDate(bookingSuccess.slot.date)}</span>
              {' '}·{' '}
              {bookingSuccess.slot.start_time} – {bookingSuccess.slot.end_time}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Reserva a nombre de <strong>{bookingSuccess.patient.name}</strong>
            </p>
            <p className="text-xs text-green-600 mt-2">
              Guardá tu email y teléfono para poder cancelar si es necesario.
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
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
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
              <p className="text-sm text-gray-500 mb-3 capitalize">{formatDate(selectedDate)}</p>
              <SlotGrid slots={slots} onSelect={setSelectedSlot} loading={loadingSlots} />
            </>
          )}
        </section>

        {/* Cancel booking */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Cancelar mi turno</h2>
          <p className="text-sm text-gray-500 mb-4">
            Ingresá el email y teléfono con los que reservaste.
          </p>

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

          {searchError && (
            <p className="mt-3 text-sm text-red-500">{searchError}</p>
          )}

          {cancelMsg && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-700">{cancelMsg}</p>
            </div>
          )}

          {myBookings && myBookings.length > 0 && (
            <div className="mt-4 space-y-2">
              {myBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {formatDate(b.date)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {b.start_time} – {b.end_time}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancelLoading}
                    className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    {cancelLoading ? '...' : 'Cancelar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
