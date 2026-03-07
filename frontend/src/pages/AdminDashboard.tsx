import { useState, useEffect, useCallback } from 'react';
import { SlotForm } from '../components/SlotForm';
import { BottomSheet } from '../components/BottomSheet';
import { StatusBadge } from '../components/StatusBadge';
import {
  getAllSlots,
  getBookings,
  updateSlot,
  deleteSlot,
  apiLogout,
  getRecurring,
  createRecurring,
  cancelRecurring,
  getProfile,
  updateProfile,
  createBooking,
  getSchedule,
  updateSchedule,
  getHolidays,
  addHolidayOverride,
  removeHolidayOverride,
} from '../lib/api';
import type { Psychologist, SlotWithBooking, BookingWithSlot, RecurringBooking, WeeklyDaySchedule, Holiday } from '../lib/types';

type Tab = 'agenda' | 'create' | 'bookings' | 'recurring' | 'settings';

const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function getWeekDates(refDate: Date): Date[] {
  const day = refDate.getDay();
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function getMonthDates(refDate: Date): Date[] {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

function getMonthCalendarGrid(refDate: Date): (Date | null)[] {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const endOffset = (7 - ((lastDay.getDay() + 1) % 7)) % 7;
  const grid: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) grid.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) grid.push(new Date(year, month, i));
  for (let i = 0; i < endOffset; i++) grid.push(null);
  return grid;
}

interface Props {
  psychologist: Psychologist;
  onLogout: () => void;
}

const TAB_ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'create',
    label: 'Crear',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    id: 'bookings',
    label: 'Reservas',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: 'recurring',
    label: 'Recurrencias',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Config',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export function AdminDashboard({ psychologist, onLogout }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [tab, setTab] = useState<Tab>('agenda');
  const [agendaView, setAgendaView] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [weekRef, setWeekRef] = useState(new Date());
  const [monthRef, setMonthRef] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [selectedDay, setSelectedDay] = useState(today);
  const [slots, setSlots] = useState<SlotWithBooking[]>([]);
  const [bookings, setBookings] = useState<BookingWithSlot[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringBooking[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<number | null>(null);
  const [cancelRecurringTarget, setCancelRecurringTarget] = useState<{ id: number; name: string } | null>(null);
  const [recurringForm, setRecurringForm] = useState({
    patient_name: '', patient_email: '', patient_phone: '',
    start_date: '', time: '', frequency_weeks: 1,
  });
  const [recurringFormError, setRecurringFormError] = useState('');
  const [recurringFormSuccess, setRecurringFormSuccess] = useState('');
  const [sessionDuration, setSessionDuration] = useState<number>(psychologist.session_duration_minutes || 45);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [cancelMinHours, setCancelMinHours] = useState(psychologist.cancel_min_hours ?? 48);
  const [rescheduleMinHours, setRescheduleMinHours] = useState(psychologist.reschedule_min_hours ?? 48);
  const [bookingMinHours, setBookingMinHours] = useState(psychologist.booking_min_hours ?? 24);
  const [whatsappNumber, setWhatsappNumber] = useState(psychologist.whatsapp_number ?? '');
  const [policiesSuccess, setPoliciesSuccess] = useState('');
  const [policiesError, setPoliciesError] = useState('');
  const [schedule, setSchedule] = useState<WeeklyDaySchedule[]>([]);
  const [scheduleSuccess, setScheduleSuccess] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysYear, setHolidaysYear] = useState<number>(new Date().getFullYear());
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedSlotForBlock, setSelectedSlotForBlock] = useState<SlotWithBooking | null>(null);
  const [assignForm, setAssignForm] = useState({ patient_name: '', patient_email: '', patient_phone: '' });
  const [assignFormError, setAssignFormError] = useState('');

  const weekDates = getWeekDates(weekRef);
  const weekDateStrs = weekDates.map(toDateStr);

  const loadSlots = useCallback(async (dates: string[]) => {
    setLoadingSlots(true);
    const results = await Promise.all(dates.map(date => getAllSlots({ date })));
    setLoadingSlots(false);
    const allFetchedSlots = results
      .filter(res => res.success && res.data)
      .flatMap(res => res.data as SlotWithBooking[]);
    setSlots(allFetchedSlots);
  }, []);

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);
    const res = await getBookings();
    setLoadingBookings(false);
    if (res.success && res.data) setBookings(res.data);
  }, []);

  const loadRecurring = useCallback(async () => {
    setLoadingRecurring(true);
    const res = await getRecurring();
    setLoadingRecurring(false);
    if (res.success && res.data) setRecurrings(res.data);
  }, []);


  const weekDatesStr = weekDateStrs.join(',');
  const monthDates = getMonthDates(monthRef);
  const monthDatesStr = monthDates.map(toDateStr).join(',');

  useEffect(() => {
    if (tab !== 'agenda') return;
    if (agendaView === 'mes') {
      loadSlots(monthDatesStr.split(','));
    } else {
      loadSlots(weekDatesStr.split(','));
    }
  }, [tab, agendaView, weekDatesStr, monthDatesStr, loadSlots]);

  const loadScheduleData = useCallback(async () => {
    const res = await getSchedule();
    if (res.success && res.data) {
      if (res.data.length > 0) {
        setSchedule(res.data);
      } else {
        setSchedule(Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i, start_time: '09:00', end_time: '18:00', active: 0,
        })));
      }
    }
  }, []);

  const loadHolidaysData = useCallback(async (year: number) => {
    const res = await getHolidays(year);
    if (res.success && res.data) setHolidays(res.data);
  }, []);

  useEffect(() => {
    if (tab === 'bookings') loadBookings();
    if (tab === 'recurring') loadRecurring();
    if (tab === 'settings') {
      getProfile().then(res => {
        if (res.success && res.data) {
          setSessionDuration(res.data.session_duration_minutes);
          setCancelMinHours(res.data.cancel_min_hours ?? 48);
          setRescheduleMinHours(res.data.reschedule_min_hours ?? 48);
          setBookingMinHours(res.data.booking_min_hours ?? 24);
          setWhatsappNumber(res.data.whatsapp_number ?? '');
        }
      });
      loadScheduleData();
      loadHolidaysData(holidaysYear);
    }
  }, [tab, loadBookings, loadRecurring, loadScheduleData, loadHolidaysData, holidaysYear]);

  const handleLogout = async () => {
    await apiLogout();
    localStorage.removeItem('psi_token');
    localStorage.removeItem('psi_user');
    onLogout();
  };

  const handleToggleBlock = async (slot: SlotWithBooking) => {
    setActionError('');
    setActionSuccess('');
    const newAvailable = slot.available === 1 ? 0 : 1;
    const res = await updateSlot(slot.id, newAvailable as 0 | 1);
    if (res.success) {
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, available: newAvailable } : s));
    } else {
      setActionError(res.error ?? 'Error al actualizar el turno');
    }
  };

  const requestDelete = (slotId: number) => {
    setSlotToDelete(slotId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (slotToDelete === null) return;
    const slotId = slotToDelete;
    setDeleteModalOpen(false);
    setSlotToDelete(null);
    setActionError('');
    setActionSuccess('');
    const res = await deleteSlot(slotId);
    if (res.success) {
      setSlots(prev => prev.filter(s => s.id !== slotId));
      setActionSuccess('Turno borrado correctamente.');
      setTimeout(() => setActionSuccess(''), 3000);
    } else {
      setActionError(res.error ?? 'Error al eliminar el turno');
    }
  };

  const openBlockModal = (slot: SlotWithBooking) => {
    if (slot.available === 0) {
      handleToggleBlock(slot);
    } else {
      setSelectedSlotForBlock(slot);
      setAssignForm({ patient_name: '', patient_email: '', patient_phone: '' });
      setAssignFormError('');
      setBlockModalOpen(true);
    }
  };

  const handleSimpleBlock = async () => {
    if (!selectedSlotForBlock) return;
    await handleToggleBlock(selectedSlotForBlock);
    setBlockModalOpen(false);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotForBlock) return;
    setAssignFormError('');
    const res = await createBooking({ slot_id: selectedSlotForBlock.id, ...assignForm });
    if (res.success) {
      setBlockModalOpen(false);
      loadSlots(agendaView === 'mes' ? monthDatesStr.split(',') : weekDateStrs);
    } else {
      setAssignFormError(res.error ?? 'Error al asignar paciente');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');
    const res = await updateProfile({ session_duration_minutes: sessionDuration });
    if (res.success) setSettingsSuccess('Duración de sesión actualizada correctamente.');
    else setSettingsError(res.error ?? 'Error al actualizar configuración');
  };

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoliciesError('');
    setPoliciesSuccess('');
    const res = await updateProfile({
      cancel_min_hours: cancelMinHours,
      reschedule_min_hours: rescheduleMinHours,
      booking_min_hours: bookingMinHours,
      whatsapp_number: whatsappNumber || null,
    });
    if (res.success) setPoliciesSuccess('Políticas guardadas correctamente.');
    else setPoliciesError(res.error ?? 'Error al guardar políticas');
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError('');
    setScheduleSuccess('');
    const res = await updateSchedule(schedule);
    if (res.success) setScheduleSuccess('Horario semanal guardado correctamente.');
    else setScheduleError(res.error ?? 'Error al guardar horario');
  };

  const handleCopySchedule = () => {
    const firstActive = schedule.find(s => s.active === 1);
    if (!firstActive) return;
    setSchedule(prev => prev.map(s => s.active === 1 ? { ...s, start_time: firstActive.start_time, end_time: firstActive.end_time } : s));
  };

  const handleToggleHoliday = async (hol: Holiday) => {
    if (hol.overridden) await removeHolidayOverride(hol.date);
    else await addHolidayOverride(hol.date);
    loadHolidaysData(holidaysYear);
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecurringFormError('');
    setRecurringFormSuccess('');
    const res = await createRecurring({ ...recurringForm, frequency_weeks: Number(recurringForm.frequency_weeks) });
    if (res.success && res.data) {
      setRecurringFormSuccess(`Recurrencia creada. ${res.data.slots_created} turno(s) generado(s).`);
      setRecurringForm({ patient_name: '', patient_email: '', patient_phone: '', start_date: '', time: '', frequency_weeks: 1 });
      loadRecurring();
      loadSlots(agendaView === 'mes' ? monthDatesStr.split(',') : weekDateStrs);
    } else {
      setRecurringFormError(res.error ?? 'Error al crear la recurrencia');
    }
  };

  const handleCancelRecurring = async (id: number) => {
    const res = await cancelRecurring(id);
    if (res.success) {
      setRecurrings(prev => prev.filter(r => r.id !== id));
      loadSlots(agendaView === 'mes' ? monthDatesStr.split(',') : weekDateStrs);
    } else {
      setRecurringFormError(res.error ?? 'Error al cancelar la recurrencia');
    }
  };

  const handlePrev = () => {
    if (agendaView === 'dia') {
      const [y, m, d] = selectedDay.split('-').map(Number);
      const prev = new Date(y, m - 1, d - 1);
      setSelectedDay(toDateStr(prev));
      setWeekRef(prev);
    } else if (agendaView === 'semana') {
      const d = new Date(weekRef);
      d.setDate(d.getDate() - 7);
      setWeekRef(d);
      setSelectedDay(toDateStr(getWeekDates(d)[0]));
    } else {
      const d = new Date(monthRef);
      d.setMonth(d.getMonth() - 1);
      setMonthRef(d);
    }
  };

  const handleNext = () => {
    if (agendaView === 'dia') {
      const [y, m, d] = selectedDay.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      setSelectedDay(toDateStr(next));
      setWeekRef(next);
    } else if (agendaView === 'semana') {
      const d = new Date(weekRef);
      d.setDate(d.getDate() + 7);
      setWeekRef(d);
      setSelectedDay(toDateStr(getWeekDates(d)[0]));
    } else {
      const d = new Date(monthRef);
      d.setMonth(d.getMonth() + 1);
      setMonthRef(d);
    }
  };

  const handleToday = () => {
    setWeekRef(new Date());
    setMonthRef(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
    setSelectedDay(today);
  };

  const selectDayFromOverview = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    setSelectedDay(dateStr);
    setWeekRef(d);
    setAgendaView('dia');
  };

  // Slots for the selected day
  const slotsByDate: Record<string, SlotWithBooking[]> = {};
  slots.forEach(s => {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  });
  const selectedDaySlots = (slotsByDate[selectedDay] ?? []).sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1a2e4a] text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Turnos Psico</h1>
              <p className="text-[11px] text-white/60">{psychologist.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white font-medium transition-colors hidden sm:block"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Desktop tab navigation */}
      <div className="bg-white border-b border-slate-200 hidden sm:block">
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-6">
            {TAB_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === id
                    ? 'border-[#1a2e4a] text-[#1a2e4a]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-5 pb-24 sm:pb-6">
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {actionError}
          </div>
        )}

        {/* ── AGENDA TAB ─────────────────────────────────── */}
        {tab === 'agenda' && (() => {
          // Navigation title
          let navTitle = '';
          if (agendaView === 'dia') {
            navTitle = formatDateLong(selectedDay);
          } else if (agendaView === 'semana') {
            const [, sm, sd] = weekDateStrs[0].split('-').map(Number);
            const [, em, ed] = weekDateStrs[6].split('-').map(Number);
            const startPart = sm !== em
              ? `${sd} ${MONTH_NAMES[sm - 1]}`
              : String(sd);
            navTitle = `${startPart} – ${ed} ${MONTH_NAMES[em - 1]}`;
          } else {
            navTitle = `${MONTH_NAMES[monthRef.getMonth()].charAt(0).toUpperCase()}${MONTH_NAMES[monthRef.getMonth()].slice(1)} ${monthRef.getFullYear()}`;
          }

          return (
            <div className="space-y-4">
              {/* Toolbar: nav arrows + title + view switcher */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600 flex-none"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-slate-700 flex-1 text-center capitalize">{navTitle}</span>
                <button
                  onClick={handleNext}
                  className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600 flex-none"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button onClick={handleToday} className="text-xs text-[#1a2e4a] font-bold hover:underline px-1 flex-none">
                  Hoy
                </button>
                {/* View switcher */}
                <div className="flex-none flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-semibold ml-1">
                  {(['dia', 'semana', 'mes'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setAgendaView(v)}
                      className={`px-2.5 py-1 rounded-md transition-colors capitalize ${
                        agendaView === v ? 'bg-white text-[#1a2e4a] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── DÍA view ── */}
              {agendaView === 'dia' && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-[#1a2e4a] capitalize">
                          {selectedDay === today ? 'Hoy — ' : ''}{formatDateLong(selectedDay)}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {selectedDaySlots.length === 0 ? 'Sin turnos' : `${selectedDaySlots.length} turno${selectedDaySlots.length !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <button
                        onClick={() => loadSlots(weekDateStrs)}
                        className="text-xs text-[#1a2e4a] font-bold hover:underline"
                      >
                        Actualizar
                      </button>
                    </div>
                    {loadingSlots ? (
                      <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-[#1a2e4a] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : selectedDaySlots.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-slate-400 font-medium">Sin turnos para este día</p>
                        <p className="text-sm text-slate-300 mt-1">Creá un turno en la pestaña Crear</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {selectedDaySlots.map((slot) => {
                          const isBooked = slot.booking_id !== null;
                          const isBlocked = slot.available === 0 && !isBooked;
                          const status = isBooked ? 'booked' : isBlocked ? 'blocked' : 'available';
                          return (
                            <div key={slot.id} className="px-5 py-4 flex items-center gap-4">
                              <div className="flex-none">
                                <p className="text-base font-bold text-[#1a2e4a]">{slot.start_time}</p>
                                <p className="text-xs text-slate-400">{slot.end_time}</p>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge status={status} />
                                  {slot.recurring_booking_id !== null && (
                                    <span className="text-[10px] text-blue-500 font-bold">↺ Recurrente</span>
                                  )}
                                </div>
                                {isBooked && (
                                  <p className="text-sm font-semibold text-slate-700 mt-0.5 truncate">{slot.patient_name}</p>
                                )}
                                {isBooked && slot.patient_email && (
                                  <p className="text-xs text-slate-400 truncate">{slot.patient_email}</p>
                                )}
                              </div>
                              {!isBooked && (
                                <div className="flex gap-2 flex-none">
                                  <button
                                    onClick={() => openBlockModal(slot)}
                                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                                      isBlocked
                                        ? 'bg-[#4caf7d]/10 text-[#1e6e44] hover:bg-[#4caf7d]/20'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {isBlocked ? 'Liberar' : 'Bloquear'}
                                  </button>
                                  <button
                                    onClick={() => requestDelete(slot.id)}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                  >
                                    Borrar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-slate-400 flex-wrap px-1">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#4caf7d]/50 inline-block" /> Disponible</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-300 inline-block" /> Reservado</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Bloqueado</span>
                  </div>
                </>
              )}

              {/* ── SEMANA view ── */}
              {agendaView === 'semana' && (
                <div className="space-y-3">
                  {loadingSlots && (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-[#1a2e4a] border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!loadingSlots && (
                    <div className="grid grid-cols-7 gap-2">
                      {weekDateStrs.map((dateStr) => {
                        const daySlots = slotsByDate[dateStr] ?? [];
                        const booked = daySlots.filter(s => s.booking_id !== null).length;
                        const available = daySlots.filter(s => s.available === 1 && s.booking_id === null).length;
                        const blocked = daySlots.filter(s => s.available === 0 && s.booking_id === null).length;
                        const total = daySlots.length;
                        const [, , dd] = dateStr.split('-').map(Number);
                        const dayDate = new Date(dateStr + 'T00:00:00');
                        const isToday = dateStr === today;
                        return (
                          <button
                            key={dateStr}
                            onClick={() => selectDayFromOverview(dateStr)}
                            className={`flex flex-col items-center rounded-2xl px-1 py-3 transition-all border ${
                              isToday
                                ? 'bg-[#1a2e4a] text-white border-[#1a2e4a]'
                                : 'bg-white text-slate-700 border-slate-100 hover:border-[#1a2e4a]/30 hover:shadow-sm'
                            }`}
                          >
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-white/70' : 'text-slate-400'}`}>
                              {DAY_SHORT[dayDate.getDay()]}
                            </span>
                            <span className={`text-lg font-bold leading-tight mt-0.5 ${isToday ? 'text-white' : 'text-[#1a2e4a]'}`}>
                              {dd}
                            </span>
                            {total > 0 ? (
                              <>
                                <div className="w-full flex h-1.5 rounded-full overflow-hidden mt-2 bg-slate-100">
                                  {booked > 0 && <div className="bg-red-400 h-full" style={{ width: `${(booked / total) * 100}%` }} />}
                                  {available > 0 && <div className="bg-[#4caf7d] h-full" style={{ width: `${(available / total) * 100}%` }} />}
                                  {blocked > 0 && <div className="bg-slate-300 h-full" style={{ width: `${(blocked / total) * 100}%` }} />}
                                </div>
                                <span className={`text-[10px] mt-1 ${isToday ? 'text-white/70' : 'text-slate-400'}`}>
                                  {total}
                                </span>
                              </>
                            ) : (
                              <div className="w-full h-1.5 rounded-full mt-2 bg-slate-100 opacity-40" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-slate-400 flex-wrap px-1">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#4caf7d]/70 inline-block" /> Disponible</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-300 inline-block" /> Reservado</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Bloqueado</span>
                  </div>
                </div>
              )}

              {/* ── MES view ── */}
              {agendaView === 'mes' && (
                <div className="space-y-3">
                  {loadingSlots && (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-[#1a2e4a] border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!loadingSlots && (() => {
                    const grid = getMonthCalendarGrid(monthRef);
                    return (
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-slate-100">
                          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                            <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase py-2">
                              {d}
                            </div>
                          ))}
                        </div>
                        {/* Grid cells */}
                        <div className="grid grid-cols-7">
                          {grid.map((cell, idx) => {
                            if (!cell) return <div key={idx} className="border-b border-r border-slate-50 min-h-[52px]" />;
                            const dateStr = toDateStr(cell);
                            const daySlots = slotsByDate[dateStr] ?? [];
                            const booked = daySlots.filter(s => s.booking_id !== null).length;
                            const available = daySlots.filter(s => s.available === 1 && s.booking_id === null).length;
                            const blocked = daySlots.filter(s => s.available === 0 && s.booking_id === null).length;
                            const total = daySlots.length;
                            const isToday = dateStr === today;
                            const isLastRow = idx >= grid.length - 7;
                            return (
                              <button
                                key={dateStr}
                                onClick={() => selectDayFromOverview(dateStr)}
                                className={`min-h-[52px] p-1.5 flex flex-col items-center border-slate-50 transition-colors hover:bg-slate-50 ${
                                  !isLastRow ? 'border-b' : ''
                                } ${idx % 7 !== 6 ? 'border-r' : ''}`}
                              >
                                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                                  isToday ? 'bg-[#1a2e4a] text-white' : 'text-slate-700'
                                }`}>
                                  {cell.getDate()}
                                </span>
                                {total > 0 && (
                                  <>
                                    {/* Dots on mobile, bar on desktop */}
                                    <div className="hidden sm:flex w-full h-1 rounded-full overflow-hidden mt-1 bg-slate-100">
                                      {booked > 0 && <div className="bg-red-400 h-full" style={{ width: `${(booked / total) * 100}%` }} />}
                                      {available > 0 && <div className="bg-[#4caf7d] h-full" style={{ width: `${(available / total) * 100}%` }} />}
                                      {blocked > 0 && <div className="bg-slate-300 h-full" style={{ width: `${(blocked / total) * 100}%` }} />}
                                    </div>
                                    <div className="flex sm:hidden gap-0.5 mt-1 flex-wrap justify-center">
                                      {booked > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                                      {available > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#4caf7d] inline-block" />}
                                      {blocked > 0 && <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />}
                                    </div>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex gap-4 text-xs text-slate-400 flex-wrap px-1">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#4caf7d]/70 inline-block" /> Disponible</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-300 inline-block" /> Reservado</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Bloqueado</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CREATE TAB ─────────────────────────────────── */}
        {tab === 'create' && (
          <div className="max-w-lg">
            <SlotForm onCreated={() => loadSlots(agendaView === 'mes' ? monthDatesStr.split(',') : weekDateStrs)} sessionDuration={sessionDuration} />
          </div>
        )}

        {/* ── BOOKINGS TAB ───────────────────────────────── */}
        {tab === 'bookings' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1a2e4a]">Todas las reservas</h2>
              <button onClick={loadBookings} className="text-sm text-[#1a2e4a] hover:underline font-semibold">
                Actualizar
              </button>
            </div>

            {loadingBookings ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-[#1a2e4a] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bookings.length === 0 ? (
              <p className="text-center text-slate-400 py-12">No hay reservas registradas.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-50">
                  {bookings.map((b) => (
                    <div key={b.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#1a2e4a]">{b.patient_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{b.patient_email}</p>
                          <p className="text-xs text-slate-400">{b.patient_phone}</p>
                        </div>
                        <div className="text-right flex-none">
                          <p className="text-sm font-semibold text-slate-700 capitalize">{formatDate(b.date)}</p>
                          <p className="text-xs text-slate-400">{b.start_time} – {b.end_time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RECURRING TAB ──────────────────────────────── */}
        {tab === 'recurring' && (
          <div className="space-y-8">
            <div className="max-w-lg">
              <h2 className="text-lg font-bold text-[#1a2e4a] mb-4">Nueva recurrencia</h2>
              <form onSubmit={handleCreateRecurring} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre del paciente</label>
                  <input
                    type="text" required
                    value={recurringForm.patient_name}
                    onChange={(e) => setRecurringForm(f => ({ ...f, patient_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email" required
                    value={recurringForm.patient_email}
                    onChange={(e) => setRecurringForm(f => ({ ...f, patient_email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    placeholder="paciente@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono</label>
                  <input
                    type="text" required
                    value={recurringForm.patient_phone}
                    onChange={(e) => setRecurringForm(f => ({ ...f, patient_phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    placeholder="+5491112345678"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha de inicio</label>
                    <input
                      type="date" required
                      value={recurringForm.start_date}
                      onChange={(e) => setRecurringForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora</label>
                    <input
                      type="time" required
                      value={recurringForm.time}
                      onChange={(e) => setRecurringForm(f => ({ ...f, time: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Frecuencia</label>
                  <select
                    value={recurringForm.frequency_weeks}
                    onChange={(e) => setRecurringForm(f => ({ ...f, frequency_weeks: Number(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  >
                    <option value={1}>Cada semana</option>
                    <option value={2}>Cada 2 semanas</option>
                    <option value={3}>Cada 3 semanas</option>
                    <option value={4}>Cada 4 semanas</option>
                  </select>
                </div>
                {recurringFormError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    {recurringFormError}
                  </p>
                )}
                {recurringFormSuccess && (
                  <p className="text-sm text-[#1e6e44] bg-[#4caf7d]/10 border border-[#4caf7d]/20 rounded-xl px-4 py-3">
                    {recurringFormSuccess}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full bg-[#1a2e4a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#243d61] transition-colors"
                >
                  Crear recurrencia
                </button>
              </form>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1a2e4a]">Recurrencias activas</h2>
                <button onClick={loadRecurring} className="text-sm text-[#1a2e4a] hover:underline font-semibold">
                  Actualizar
                </button>
              </div>
              {loadingRecurring ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-[#1a2e4a] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : recurrings.length === 0 ? (
                <p className="text-center text-slate-400 py-12">No hay recurrencias activas.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <div className="divide-y divide-slate-50">
                    {recurrings.map((r) => (
                      <div key={r.id} className="px-5 py-4 flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#1a2e4a]">{r.patient_name}</p>
                          <p className="text-xs text-slate-400">{r.patient_email}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {r.frequency_weeks === 1 ? 'Semanal' : `Cada ${r.frequency_weeks} semanas`}
                            {' · '}{r.time}
                            {r.next_appointment && ` · próx: ${formatDate(r.next_appointment)}`}
                          </p>
                        </div>
                        <button
                          onClick={() => setCancelRecurringTarget({ id: r.id, name: r.patient_name })}
                          className="text-xs text-red-500 hover:text-red-700 font-semibold flex-none"
                        >
                          Cancelar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ───────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-4xl space-y-6">
            {/* Session duration */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-base font-bold text-[#1a2e4a] mb-4">Duración de la sesión</h2>
              <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Minutos</label>
                  <select
                    value={sessionDuration}
                    onChange={(e) => setSessionDuration(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  >
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={50}>50 minutos</option>
                    <option value={60}>60 minutos (1 hora)</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400">Se usará al crear nuevos turnos y recurrencias.</p>
                </div>
                {settingsError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{settingsError}</p>}
                {settingsSuccess && <p className="text-sm text-[#1e6e44] bg-[#4caf7d]/10 border border-[#4caf7d]/20 rounded-xl px-4 py-3">{settingsSuccess}</p>}
                <button type="submit" className="w-full bg-[#1a2e4a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#243d61] transition-colors">
                  Guardar
                </button>
              </form>
            </div>

            {/* Policies */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-base font-bold text-[#1a2e4a] mb-1">Políticas de autogestión</h2>
              <p className="text-xs text-slate-400 mb-4">Tiempo mínimo de anticipación que deben respetar los pacientes.</p>
              <form onSubmit={handleSavePolicies} className="space-y-4 max-w-lg">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cancelación (hs)</label>
                    <input
                      type="number" min={0} max={168} step={0.5} required
                      value={cancelMinHours}
                      onChange={(e) => setCancelMinHours(parseFloat(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reagendamiento (hs)</label>
                    <input
                      type="number" min={0} max={168} step={0.5} required
                      value={rescheduleMinHours}
                      onChange={(e) => setRescheduleMinHours(parseFloat(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nueva sesión (hs)</label>
                    <input
                      type="number" min={0} max={168} step={0.5} required
                      value={bookingMinHours}
                      onChange={(e) => setBookingMinHours(parseFloat(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Número de WhatsApp</label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+5491112345678"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Se usará para redirigir pacientes cuando no puedan autogestionar.</p>
                </div>
                {policiesError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{policiesError}</p>}
                {policiesSuccess && <p className="text-sm text-[#1e6e44] bg-[#4caf7d]/10 border border-[#4caf7d]/20 rounded-xl px-4 py-3">{policiesSuccess}</p>}
                <button type="submit" className="w-full bg-[#1a2e4a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#243d61] transition-colors">
                  Guardar políticas
                </button>
              </form>
            </div>

            {/* Weekly schedule */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-[#1a2e4a]">Horario semanal</h2>
                <button type="button" onClick={handleCopySchedule} className="text-sm text-[#1a2e4a] hover:underline font-semibold">
                  Copiar a todos
                </button>
              </div>
              <p className="text-sm text-slate-400 mb-5">Los turnos se generan automáticamente en estos rangos.</p>
              <form onSubmit={handleSaveSchedule} className="space-y-3">
                {DAY_FULL.map((dayName, index) => {
                  const daySch = schedule.find(s => s.day_of_week === index);
                  if (!daySch) return null;
                  return (
                    <div key={index} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${daySch.active === 1 ? 'border-[#1a2e4a]/15 bg-[#1a2e4a]/3' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex items-center gap-2.5 w-28">
                        <input
                          type="checkbox"
                          checked={daySch.active === 1}
                          onChange={(e) => setSchedule(prev => prev.map(s => s.day_of_week === index ? { ...s, active: e.target.checked ? 1 : 0 } : s))}
                          className="w-4 h-4 rounded border-slate-300 text-[#1a2e4a] focus:ring-[#1a2e4a]/30"
                        />
                        <span className={`text-sm font-semibold ${daySch.active === 1 ? 'text-[#1a2e4a]' : 'text-slate-400'}`}>{dayName}</span>
                      </div>
                      {daySch.active === 1 ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time" required
                            value={daySch.start_time}
                            onChange={(e) => setSchedule(prev => prev.map(s => s.day_of_week === index ? { ...s, start_time: e.target.value } : s))}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                          />
                          <span className="text-slate-300 text-sm">–</span>
                          <input
                            type="time" required
                            value={daySch.end_time}
                            onChange={(e) => setSchedule(prev => prev.map(s => s.day_of_week === index ? { ...s, end_time: e.target.value } : s))}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 flex-1">No disponible</p>
                      )}
                    </div>
                  );
                })}
                {scheduleError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-lg">{scheduleError}</p>}
                {scheduleSuccess && <p className="text-sm text-[#1e6e44] bg-[#4caf7d]/10 border border-[#4caf7d]/20 rounded-xl px-4 py-3 max-w-lg">{scheduleSuccess}</p>}
                <div className="max-w-lg">
                  <button type="submit" className="w-full bg-[#1a2e4a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#243d61] transition-colors">
                    Guardar horario
                  </button>
                </div>
              </form>
            </div>

            {/* Holidays */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-[#1a2e4a]">Feriados argentinos</h2>
                <select
                  value={holidaysYear}
                  onChange={(e) => setHolidaysYear(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                >
                  <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                  <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                  <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
                </select>
              </div>
              <p className="text-sm text-slate-400 mb-5">Por defecto no se generan turnos en feriados. Podés marcarlos como laborables.</p>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {holidays.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No se pudieron cargar los feriados para {holidaysYear}</p>
                ) : (
                  holidays.map(hol => (
                    <div key={hol.date} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-[#1a2e4a] capitalize">{formatDate(hol.date)}</p>
                        <p className="text-xs text-slate-400">{hol.localName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${hol.overridden ? 'text-[#1e6e44]' : 'text-slate-400'}`}>
                          {hol.overridden ? 'Se trabaja' : 'No laborable'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={hol.overridden} onChange={() => handleToggleHoliday(hol)} />
                          <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#4caf7d]"></div>
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Logout on mobile */}
            <div className="sm:hidden">
              <button
                onClick={handleLogout}
                className="w-full border border-slate-200 text-slate-600 py-3 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40 sm:hidden safe-area-bottom">
        <div className="flex">
          {TAB_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                tab === id ? 'text-[#1a2e4a]' : 'text-slate-400'
              }`}
            >
              {icon}
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Block / Assign Modal */}
      <BottomSheet
        isOpen={blockModalOpen && selectedSlotForBlock !== null}
        onClose={() => setBlockModalOpen(false)}
        title={selectedSlotForBlock ? `Turno ${selectedSlotForBlock.start_time}` : 'Gestionar turno'}
      >
        {selectedSlotForBlock && (
          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-[#1a2e4a] mb-1">Bloquear turno</h4>
              <p className="text-sm text-slate-500 mb-3">Nadie podrá reservar este horario.</p>
              <button
                onClick={handleSimpleBlock}
                className="w-full bg-slate-100 text-slate-800 rounded-xl py-3 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Bloquear
              </button>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h4 className="font-bold text-[#1a2e4a] mb-1">Asignar paciente</h4>
              <p className="text-sm text-slate-500 mb-4">Registrá un paciente que ya coordinó por WhatsApp.</p>
              <form onSubmit={handleAssignSubmit} className="space-y-3">
                <input
                  type="text" required placeholder="Nombre completo"
                  value={assignForm.patient_name}
                  onChange={e => setAssignForm(f => ({ ...f, patient_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <input
                  type="email" required placeholder="Email"
                  value={assignForm.patient_email}
                  onChange={e => setAssignForm(f => ({ ...f, patient_email: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                <input
                  type="text" required placeholder="Teléfono (+549...)"
                  value={assignForm.patient_phone}
                  onChange={e => setAssignForm(f => ({ ...f, patient_phone: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
                {assignFormError && <p className="text-xs text-red-600">{assignFormError}</p>}
                <button
                  type="submit"
                  className="w-full bg-[#1a2e4a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#243d61] transition-colors"
                >
                  Asignar paciente
                </button>
              </form>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Toast */}
      {actionSuccess && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 bg-[#1a2e4a] text-white px-5 py-3 rounded-2xl shadow-xl font-medium flex items-center gap-3 z-50">
          <div className="w-6 h-6 rounded-full bg-[#4caf7d] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          {actionSuccess}
        </div>
      )}

      {/* Delete Confirmation */}
      <BottomSheet
        isOpen={cancelRecurringTarget !== null}
        onClose={() => setCancelRecurringTarget(null)}
        title="¿Cancelar recurrencia?"
      >
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Se cancelará toda la recurrencia de <span className="font-bold text-slate-700">{cancelRecurringTarget?.name}</span> y sus turnos futuros serán eliminados.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setCancelRecurringTarget(null)}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { const t = cancelRecurringTarget; setCancelRecurringTarget(null); if (t) handleCancelRecurring(t.id); }}
            className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors"
          >
            Sí, cancelar
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setSlotToDelete(null); }}
        title="¿Borrar este turno?"
      >
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Esta acción no se puede deshacer. El turno será eliminado de la agenda permanentemente.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { setDeleteModalOpen(false); setSlotToDelete(null); }}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmDelete}
            className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors"
          >
            Sí, borrar
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
