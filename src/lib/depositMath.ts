/**
 * สูตรคำนวณเงินมัดจำกุญแจ (ใช้ร่วมกันทุกหน้าจอ)
 *
 * หลักการ: ค่าใช้จ่ายต้องชำระให้ครบก่อน เงินที่เหลือจึงนับเป็นเงินมัดจำ
 *   มัดจำที่ถือจริง = min(ยอดที่ตกลงเก็บ, max(0, เงินที่จ่ายจริง - ค่าใช้จ่าย))
 *   เงินเกินยอดที่ตกลง = เงินทอนที่ต้องคืน
 * ค่าใช้จ่ายที่เพิ่มภายหลัง (มินิบาร์/ค่าปรับ) จึงหักจากมัดจำเองโดยอัตโนมัติ
 */
export type LedgerLike = { transaction_type: string; category: string; amount: number | string };

export const DEPOSIT_KEY = 'มัดจำกุญแจ';

export type DepositSummary = {
  charges: number;        // ค่าใช้จ่ายจริงที่เกิดขึ้นแล้ว (ไม่รวมมัดจำ)
  cash: number;           // เงินที่ลูกค้าจ่ายจริง (เงินสด/โอน/บัตร)
  target: number;         // ยอดมัดจำที่ตกลงเก็บ
  surplus: number;        // เงินที่จ่าย - ค่าใช้จ่าย (ลบ = ค้างชำระ)
  unpaid: number;         // ค่าใช้จ่ายที่ยังค้างชำระ
  held: number;           // เงินมัดจำที่ถืออยู่จริง
  shortfall: number;      // มัดจำที่ยังเก็บไม่ครบตามที่ตกลง
  excess: number;         // เงินเกินยอดที่ตกลง = เงินทอนที่ต้องคืน
  refunded: number;       // มัดจำที่คืนไปแล้ว
};

export function computeDeposit(txs: LedgerLike[]): DepositSummary {
  const valid = txs.filter(t => !t.category.includes('Voided'));
  const isDepositCat = (t: LedgerLike) => t.category.includes(DEPOSIT_KEY);

  const target = valid
    .filter(t => Number(t.amount) > 0 && (t.transaction_type === 'deposit' || t.category === 'ค่ามัดจำกุญแจ' || t.category === 'key_deposit'))
    .reduce((s, t) => s + Number(t.amount), 0);

  const charges = valid
    .filter(t => Number(t.amount) > 0 && !isDepositCat(t))
    .reduce((s, t) => s + Number(t.amount), 0);

  const rawCash = valid
    .filter(t => t.transaction_type === 'payment' && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const changeRefunded = valid
    .filter(t => t.category.includes('คืนเงินทอน') && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const cash = Math.max(0, rawCash - changeRefunded);

  const refunded = valid
    .filter(t => t.category.includes('คืนมัดจำกุญแจ'))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const surplus = cash - charges;
  const unpaid = Math.max(0, -surplus);
  const held = Math.min(target, Math.max(0, surplus));
  const shortfall = Math.max(0, target - held);
  const excess = Math.max(0, surplus - target);

  return { charges, cash, target, surplus, unpaid, held, shortfall, excess, refunded };
}
