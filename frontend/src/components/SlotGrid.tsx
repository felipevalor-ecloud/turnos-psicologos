import type { Slot } from '../lib/types';

interface Props {
  slots: Slot[];
  onSelect: (slot: Slot) => void;
  loading?: boolean;
}

export function SlotGrid({ slots, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No hay turnos disponibles para esta fecha.</p>
        <p className="text-sm mt-1">Seleccioná otra fecha para ver la disponibilidad.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {slots.map((slot) => (
        <button
          key={slot.id}
          onClick={() => onSelect(slot)}
          className="px-3 py-3 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          {slot.start_time}
        </button>
      ))}
    </div>
  );
}
