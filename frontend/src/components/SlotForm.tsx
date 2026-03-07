import { useState } from 'react';
import { createSlot, createBatchSlots } from '../lib/api';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props {
  onCreated: () => void;
  sessionDuration: number;
}

export function SlotForm({ onCreated, sessionDuration }: Props) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Single slot
  const [singleDate, setSingleDate] = useState('');
  const [singleTime, setSingleTime] = useState('');

  // Batch slots
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [batchTime, setBatchTime] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await createSlot({ date: singleDate, start_time: singleTime });
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: `Turno creado: ${singleDate} a las ${singleTime}` });
      setSingleDate('');
      setSingleTime('');
      onCreated();
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Error al crear el turno' });
    }
  };

  const handleBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0) {
      setMessage({ type: 'error', text: 'Seleccioná al menos un día de la semana' });
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await createBatchSlots({
      start_date: startDate, end_date: endDate, start_time: batchTime, days_of_week: selectedDays,
    });
    setLoading(false);
    if (res.success && res.data) {
      const { created, skipped } = res.data;
      setMessage({
        type: 'success',
        text: `Se crearon ${created} turnos.${skipped > 0 ? ` ${skipped} omitidos por superposición.` : ''}`,
      });
      onCreated();
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Error al crear turnos' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-base font-bold text-[#1a2e4a] mb-4">Crear turnos</h3>

      <div className="flex gap-2 mb-5 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'single' ? 'bg-white text-[#1a2e4a] shadow-sm' : 'text-slate-500'
          }`}
        >
          Individual
        </button>
        <button
          onClick={() => setMode('batch')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'batch' ? 'bg-white text-[#1a2e4a] shadow-sm' : 'text-slate-500'
          }`}
        >
          En lote
        </button>
      </div>

      {mode === 'single' ? (
        <form onSubmit={handleSingle} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
            <input
              type="date" required min={today}
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora de inicio</label>
            <input
              type="time" required
              value={singleTime}
              onChange={(e) => setSingleTime(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
            />
            <p className="text-xs text-slate-400 mt-1.5">Duración: {sessionDuration} minutos.</p>
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-[#1a2e4a] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando...' : 'Crear turno'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBatch} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha inicio</label>
              <input
                type="date" required min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha fin</label>
              <input
                type="date" required min={startDate || today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora de inicio</label>
            <input
              type="time" required
              value={batchTime}
              onChange={(e) => setBatchTime(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Días de la semana</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedDays.includes(i)
                      ? 'bg-[#1a2e4a] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-[#1a2e4a] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#243d61] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando turnos...' : 'Crear en lote'}
          </button>
        </form>
      )}

      {message && (
        <div
          className={`mt-4 p-3 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-[#4caf7d]/10 text-[#1e6e44] border border-[#4caf7d]/20'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
