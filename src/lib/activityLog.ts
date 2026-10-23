import { supabase } from '@/lib/supabase';

export type ActivityLogCategory = 'addons' | 'checkin' | 'billing' | 'shift' | 'settings';

export type ActivityLogAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'ACTION'
  | 'create'
  | 'update'
  | 'delete'
  | 'toggle'
  | 'cancel'
  | 'checkin'
  | 'checkout'
  | 'reserve'
  | 'move'
  | 'payment';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  staff_name: string;
  staffName?: string;
  shift_name?: string;
  shiftName?: string;
  category: ActivityLogCategory;
  action: ActivityLogAction;
  target: string;
  details: string;
  room_no?: string;
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityLogCategory, { label: string; icon: string; badgeClass: string }> = {
  addons: {
    label: 'บริการเสริม (Add-ons)',
    icon: '🛎️',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  checkin: {
    label: 'เช็คอิน / ห้องพัก',
    icon: '🚪',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  billing: {
    label: 'บิล / การเงิน / มัดจำ',
    icon: '💳',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  shift: {
    label: 'กะทำงาน / เงินสดย่อย',
    icon: '🔐',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  settings: {
    label: 'ตั้งค่าระบบ / แผนราคา',
    icon: '⚙️',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};

export const ACTIVITY_ACTION_LABELS: Record<ActivityLogAction, { label: string; className: string }> = {
  CREATE: { label: 'เพิ่มรายการ', className: 'bg-emerald-100 text-emerald-800' },
  UPDATE: { label: 'แก้ไข', className: 'bg-amber-100 text-amber-800' },
  DELETE: { label: 'ลบ', className: 'bg-rose-100 text-rose-800' },
  VOID: { label: 'ยกเลิก/คืนเงิน', className: 'bg-rose-100 text-rose-800' },
  ACTION: { label: 'ทำรายการ', className: 'bg-slate-100 text-slate-700' },
  create: { label: 'เพิ่มรายการ', className: 'bg-emerald-100 text-emerald-800' },
  update: { label: 'แก้ไข', className: 'bg-amber-100 text-amber-800' },
  delete: { label: 'ลบ', className: 'bg-rose-100 text-rose-800' },
  toggle: { label: 'สลับค่า', className: 'bg-indigo-100 text-indigo-800' },
  cancel: { label: 'ยกเลิก/คืนเงิน', className: 'bg-rose-100 text-rose-800' },
  checkin: { label: 'เช็คอิน', className: 'bg-blue-100 text-blue-800' },
  checkout: { label: 'เช็คเอาท์', className: 'bg-slate-100 text-slate-700' },
  reserve: { label: 'จองห้องพัก', className: 'bg-purple-100 text-purple-800' },
  move: { label: 'ย้ายห้อง/เลื่อนวัน', className: 'bg-amber-100 text-amber-800' },
  payment: { label: 'รับชำระเงิน', className: 'bg-emerald-100 text-emerald-800' },
};

function getLoggedInUserNameFallback(): string {
  if (typeof window === 'undefined') return 'SYSTEM';
  try {
    const raw = localStorage.getItem('auth_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.name) return String(parsed.name);
    }
  } catch {}
  return 'พนักงาน';
}

function getCutoffDateStr(daysAgo: number, baseDate: Date = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export async function logActivity(params: {
  category: ActivityLogCategory;
  action: ActivityLogAction;
  target: string;
  details: string;
  staffName?: string | null;
  shiftName?: string | null;
  roomNo?: string | null;
  now?: Date;
}): Promise<void> {
  try {
    const nowDate = params.now || new Date();
    const dateStr = nowDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const key = `activity_log_${dateStr}`;
    const staff_name = params.staffName?.trim() || getLoggedInUserNameFallback();
    const shift_name = params.shiftName || undefined;

    const newEntry: ActivityLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowDate.toISOString(),
      staff_name,
      staffName: staff_name,
      shift_name,
      shiftName: shift_name,
      category: params.category,
      action: params.action,
      target: params.target,
      details: params.details,
      room_no: params.roomNo || undefined,
    };

    const { data: existingRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const existingList: ActivityLogEntry[] = Array.isArray(existingRow?.value)
      ? (existingRow.value as ActivityLogEntry[])
      : [];

    const updatedList = [newEntry, ...existingList];

    await supabase
      .from('system_settings')
      .upsert({ key, value: updatedList }, { onConflict: 'key' });

    // Auto-cleanup logs older than 30 days in background
    const cutoff30Str = getCutoffDateStr(30, nowDate);
    const { data: allLogKeys } = await supabase
      .from('system_settings')
      .select('key')
      .like('key', 'activity_log_%');

    if (allLogKeys && allLogKeys.length > 0) {
      const expiredKeys = allLogKeys
        .map(r => String(r.key))
        .filter(k => {
          const datePart = k.replace('activity_log_', '');
          return /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoff30Str;
        });
      if (expiredKeys.length > 0) {
        await supabase.from('system_settings').delete().in('key', expiredKeys);
      }
    }
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

export async function fetchActivityLogs(
  options?: number | { days?: number; category?: ActivityLogCategory | 'ALL' }
): Promise<ActivityLogEntry[]> {
  const days = typeof options === 'number' ? options : (options?.days ?? 30);
  const categoryFilter = typeof options === 'number' ? 'ALL' : (options?.category ?? 'ALL');
  const cutoffStr = getCutoffDateStr(days);

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .like('key', 'activity_log_%');

  if (error || !data) return [];

  const expiredKeys: string[] = [];
  const allEntries: ActivityLogEntry[] = [];

  data.forEach(row => {
    const key = String(row.key || '');
    const datePart = key.replace('activity_log_', '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffStr) {
      expiredKeys.push(key);
      return;
    }
    if (Array.isArray(row.value)) {
      row.value.forEach((item: ActivityLogEntry) => {
        if (!categoryFilter || categoryFilter === 'ALL' || item.category === categoryFilter) {
          allEntries.push({
            ...item,
            staffName: item.staffName || item.staff_name,
            shiftName: item.shiftName || item.shift_name,
          });
        }
      });
    }
  });

  if (expiredKeys.length > 0) {
    supabase.from('system_settings').delete().in('key', expiredKeys).then(() => {});
  }

  return allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
