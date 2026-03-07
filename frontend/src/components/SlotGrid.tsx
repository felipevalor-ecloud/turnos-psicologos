import { SlotChip } from './SlotChip';
import type { Slot } from '../lib/types';

interface Props {
  slots: Slot[];
  onSelect: (slot: Slot) => void;
  loading?: boolean;
}

export function SlotGrid({ slots, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-slate-400 font-medium">Sin turnos disponibles</p>
        <p className="text-sm text-slate-300 mt-1">Elegí otra fecha</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {slots.map((slot) => (
        <SlotChip key={slot.id} slot={slot} onSelect={onSelect} />
      ))}
    </div>
  );
}
