interface Props {
  status: 'available' | 'booked' | 'blocked';
}

const CONFIG = {
  available: { label: 'Disponible', cls: 'bg-[#4caf7d]/15 text-[#1e6e44]' },
  booked: { label: 'Reservado', cls: 'bg-red-50 text-red-600' },
  blocked: { label: 'Bloqueado', cls: 'bg-slate-100 text-slate-500' },
};

export function StatusBadge({ status }: Props) {
  const cfg = CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
