import { useState } from 'react';
import type { Slot, BookingResult } from '../lib/types';
import { createBooking } from '../lib/api';
import { BottomSheet } from './BottomSheet';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

interface Props {
  slot: Slot;
  onClose: () => void;
  onSuccess: (result: BookingResult, warning?: string, policyHours?: number) => void;
}

export function BookingModal({ slot, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ patient_name: '', patient_email: '', patient_phone: '+549' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await createBooking({ slot_id: slot.id, ...form });
    setLoading(false);
    if (res.success && res.data) {
      onSuccess(res.data, res.warning, res.policy_hours);
    } else {
      setError(res.error ?? 'Error al agendar la sesión');
    }
  };

  return (
    <BottomSheet isOpen title="Agendar sesión" onClose={onClose}>
      <div className="mb-5 p-4 bg-[#1a2e4a]/5 rounded-xl border border-[#1a2e4a]/10">
        <p className="text-xs font-bold text-[#1a2e4a]/50 uppercase mb-1 tracking-wide">Sesión seleccionada</p>
        <p className="text-sm text-[#1a2e4a] font-semibold capitalize">{formatDate(slot.date)}</p>
        <p className="text-xl font-bold text-[#1a2e4a] mt-0.5">{slot.start_time} – {slot.end_time}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre completo</label>
          <input
            type="text"
            required
            value={form.patient_name}
            onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
            placeholder="Juan Pérez"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 focus:border-[#1a2e4a]/50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={form.patient_email}
            onChange={(e) => setForm({ ...form, patient_email: e.target.value })}
            placeholder="juan@email.com"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 focus:border-[#1a2e4a]/50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono celular</label>
          <input
            type="tel"
            required
            value={form.patient_phone}
            onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
            placeholder="+5491112345678"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 focus:border-[#1a2e4a]/50"
          />
          <p className="text-xs text-slate-400 mt-1">Formato: +5491112345678</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 py-3.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#1a2e4a] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Agendando...' : 'Confirmar sesión'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
