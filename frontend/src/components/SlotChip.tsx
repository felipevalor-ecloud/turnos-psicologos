import type { Slot } from '../lib/types';

interface Props {
  slot: Slot;
  onSelect: (slot: Slot) => void;
}

export function SlotChip({ slot, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(slot)}
      className="flex flex-col items-center justify-center py-3.5 px-2 bg-[#4caf7d]/10 hover:bg-[#4caf7d]/20 border border-[#4caf7d]/40 text-[#1e6e44] rounded-xl font-bold transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#4caf7d]/50 text-sm"
    >
      {slot.start_time}
    </button>
  );
}
