import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const rawSupabase = createClient(supabaseUrl, supabaseKey);

export function isExecutiveReadOnlyUser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem('auth_user');
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    const role = String(parsed?.role || '').toLowerCase();
    return role === 'executive' || role === 'viewer' || Boolean(parsed?.read_only);
  } catch {
    return false;
  }
}

function createBlockedMutationBuilder() {
  const errResult = {
    data: null,
    error: {
      message: '👁️ บัญชีผู้บริหาร (ดูอย่างเดียว): ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลในระบบได้',
      code: 'READ_ONLY_EXECUTIVE',
    },
    count: null,
    status: 403,
    statusText: 'Forbidden (Read-Only Executive)',
  };
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled?: any, onRejected?: any) =>
            Promise.resolve(errResult).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          return (onRejected?: any) => Promise.resolve(errResult).catch(onRejected);
        }
        if (prop === 'finally') {
          return (onFinally?: any) => Promise.resolve(errResult).finally(onFinally);
        }
        return () => proxy;
      },
    }
  );
  return proxy;
}

export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (table: string) => {
        const qb: any = target.from(table);
        if (!isExecutiveReadOnlyUser()) return qb;
        return new Proxy(qb, {
          get(qTarget, qProp, qReceiver) {
            if (
              qProp === 'insert' ||
              qProp === 'update' ||
              qProp === 'upsert' ||
              qProp === 'delete'
            ) {
              return () => {
                if (typeof window !== 'undefined') {
                  window.alert(
                    '👁️ โหมดผู้บริหาร (ดูข้อมูลอย่างเดียว)\n\nบัญชีนี้สามารถเปิดดูข้อมูลได้ทุกหน้า แต่ไม่อนุญาตให้เพิ่ม แก้ไข หรือลบข้อมูลใดๆ ในระบบครับ'
                  );
                }
                return createBlockedMutationBuilder();
              };
            }
            const val = Reflect.get(qTarget, qProp, qReceiver);
            return typeof val === 'function' ? val.bind(qTarget) : val;
          },
        });
      };
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
