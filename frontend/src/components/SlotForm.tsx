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
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
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
      start_date: startDate,
      end_date: endDate,
      start_time: batchTime,
      days_of_week: selectedDays,
    });
    setLoading(false);

    if (res.success && res.data) {
      const { created, skipped } = res.data;
      setMessage({
        type: 'success',
        text: `Se crearon ${created} turnos. ${skipped > 0 ? `${skipped} omitidos por superposición.` : ''}`,
      });
      onCreated();
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Error al crear turnos' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-800 mb-4">Crear turnos</h3>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'single'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
          Turno individual
        </button>
        <button
          onClick={() => setMode('batch')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'batch'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
          Turnos en lote
        </button>
      </div>

      {mode === 'single' ? (
        <form onSubmit={handleSingle} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              required
              min={today}
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de inicio</label>
            <input
              type="time"
              required
              value={singleTime}
              onChange={(e) => setSingleTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">La duración es de {sessionDuration} minutos.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando...' : 'Crear turno'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBatch} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input
                type="date"
                required
                min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
              <input
                type="date"
                required
                min={startDate || today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de inicio</label>
            <input
              type="time"
              required
              value={batchTime}
              onChange={(e) => setBatchTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Días de la semana
            </label>
            <div className="flex gap-1 flex-wrap">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedDays.includes(i)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creando turnos...' : 'Crear en lote'}
          </button>
        </form>
      )}

      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm ${message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-600 border border-red-200'
            }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
