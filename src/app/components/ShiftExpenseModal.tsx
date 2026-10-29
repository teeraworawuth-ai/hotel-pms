"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useShift } from "@/contexts/ShiftContext";
import { logActivity } from "@/lib/activityLog";

type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  notes?: string | null;
  staff_name: string;
  created_at: string;
};

const fmt = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

/** ดึงลิงก์รูปบิลจาก notes รูปแบบ [BILL:url1|url2] */
export function parseBillUrls(notes?: string | null): string[] {
  const m = String(notes || "").match(/\[BILL:([^\]]+)\]/);
  return m ? m[1].split("|").filter(Boolean) : [];
}

export function stripBillTag(notes?: string | null): string {
  return String(notes || "").replace(/\[BILL:[^\]]+\]/, "").trim();
}

/** ย่อขนาดรูปให้เล็กลง (ยาวสุด 1280px, JPEG 70%) ก่อนอัปโหลด */
async function compressImage(file: File): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.7));
}

/**
 * ปุ่ม "💸 รายจ่ายกะนี้" + หน้าต่างบันทึกรายจ่ายเงินสด (แนบรูปบิลได้)
 * แสดงจำนวนรายการ/ยอดรวมของกะปัจจุบัน เพื่อให้พนักงานเช็คได้ว่าลงรายจ่ายไปแล้วหรือยัง
 */
export default function ShiftExpenseButton({
  compact = false,
  openExternally,
  onCloseExternal,
  hideTrigger = false,
}: {
  compact?: boolean;
  openExternally?: boolean;
  onCloseExternal?: () => void;
  hideTrigger?: boolean;
}) {
  const { activeShift, operatorName, refreshShift, ensureShiftWritable } = useShift();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const isOpen = open || !!openExternally;
  const shiftId = activeShift && activeShift.id !== "dummy-shift-id" ? activeShift.id : null;

  const loadRows = useCallback(async () => {
    if (!shiftId) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from("ledger_transactions")
      .select("id, category, amount, notes, staff_name, created_at")
      .eq("shift_id", shiftId)
      .eq("transaction_type", "expense")
      .order("created_at", { ascending: true });
    setRows(((data as ExpenseRow[]) || []).filter((r) => !String(r.category || "").includes("(Voided)")));
  }, [shiftId]);

  useEffect(() => {
    loadRows();
  }, [loadRows, activeShift?.expected_cash]);

  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "expense_presets")
      .maybeSingle()
      .then(({ data }) => {
        if (data && Array.isArray(data.value)) setPresets(data.value as string[]);
      });
    loadRows();
  }, [isOpen, loadRows]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (!shiftId) return null;

  const total = rows.reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);

  const close = () => {
    setOpen(false);
    setError("");
    setReason("");
    setAmount("");
    setFiles([]);
    onCloseExternal?.();
  };

  const handleSave = async () => {
    setError("");
    if (!ensureShiftWritable()) return;
    if (!reason.trim() || !amount || Number(amount) <= 0) {
      setError("กรุณากรอกรายการและจำนวนเงินให้ครบ");
      return;
    }
    setSaving(true);
    try {
      const urls: string[] = [];
      for (const f of files) {
        const blob = await compressImage(f);
        const path = `expense-bills/${shiftId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("housekeeping-photos")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error("อัปโหลดรูปบิลไม่สำเร็จ: " + upErr.message);
        urls.push(supabase.storage.from("housekeeping-photos").getPublicUrl(path).data.publicUrl);
      }
      const { error: insErr } = await supabase.from("ledger_transactions").insert({
        shift_id: shiftId,
        staff_name: operatorName || activeShift!.staff_name,
        transaction_type: "expense",
        category: reason.trim(),
        amount: -Number(amount),
        notes: urls.length > 0 ? `[BILL:${urls.join("|")}]` : null,
      });
      if (insErr) throw new Error("บันทึกรายจ่ายไม่สำเร็จ: " + insErr.message);

      if (!presets.includes(reason.trim())) {
        const next = [reason.trim(), ...presets].slice(0, 20);
        setPresets(next);
        await supabase.from("system_settings").upsert({ key: "expense_presets", value: next }, { onConflict: "key" });
      }
      await logActivity({
        category: "shift",
        action: "create",
        staffName: operatorName || activeShift!.staff_name,
        shiftName: activeShift!.staff_name,
        target: `รายจ่ายเงินสด • ${reason.trim()}`,
        details: `บันทึกรายจ่ายเงินสด "${reason.trim()}" ${fmt(Number(amount))}${urls.length ? ` (แนบรูปบิล ${urls.length} รูป)` : ""}`,
      });
      setReason("");
      setAmount("");
      setFiles([]);
      await loadRows();
      refreshShift();
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`font-bold transition-colors active:scale-95 border ${
            rows.length > 0
              ? "bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-200"
              : "bg-white hover:bg-orange-50 text-orange-700 border-orange-200"
          } ${compact ? "px-2 py-1 rounded-lg text-[11px]" : "px-4 py-1.5 rounded-full text-sm"}`}
          title="บันทึก/ตรวจสอบรายจ่ายเงินสดของกะนี้"
        >
          {compact
            ? `💸 รายจ่าย (${rows.length}${rows.length > 0 ? `•${fmt(total)}` : ""})`
            : `💸 รายจ่ายกะนี้ (${rows.length} รายการ${rows.length > 0 ? ` • ${fmt(total)}` : ""})`}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 bg-orange-600 text-white">
              <h3 className="text-lg font-black">💸 รายจ่ายเงินสดของกะนี้</h3>
              <p className="text-xs text-orange-100 mt-0.5">
                กะ: {activeShift!.staff_name} • นำเงินสดในลิ้นชักไปจ่ายแล้วบันทึกที่นี่ ระบบจะหักออกจากยอดเงินที่ต้องส่งอัตโนมัติ
              </p>
            </div>

            <div className="p-5 space-y-3">
              {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg font-bold">{error}</div>}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">รายการค่าใช้จ่าย</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none"
                  placeholder="เช่น ซื้อน้ำแข็ง, น้ำยาทำความสะอาด"
                />
                {presets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {presets
                      .filter((p) => p.toLowerCase().includes(reason.toLowerCase()))
                      .slice(0, 8)
                      .map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setReason(p)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200"
                        >
                          {p}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">จำนวนเงินสดที่จ่ายออก</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-2xl text-center font-black p-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">📷 รูปบิล / ใบเสร็จ (ถ้ามี)</label>
                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 text-orange-800 font-bold text-sm cursor-pointer hover:bg-orange-100">
                  📷 ถ่ายรูปบิล / เลือกรูป
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files || [])].slice(0, 4))}
                  />
                </label>
                {previews.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {previews.map((p, i) => (
                      <div key={p} className="relative">
                        <img src={p} alt="bill" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !reason.trim() || !amount}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "＋ บันทึกรายจ่าย"}
              </button>

              {/* รายการที่บันทึกแล้วในกะนี้ */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-black text-slate-800 text-sm">✅ รายจ่ายที่บันทึกแล้วในกะนี้</span>
                  <span className="text-xs font-bold text-orange-700">
                    {rows.length} รายการ • รวม {fmt(total)}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg">ยังไม่มีรายจ่ายในกะนี้</div>
                ) : (
                  <ul className="space-y-1.5">
                    {rows.map((r) => {
                      const bills = parseBillUrls(r.notes);
                      return (
                        <li
                          key={r.id}
                          className="flex justify-between items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{r.category}</div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(r.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น. • โดย{" "}
                              {r.staff_name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {bills.map((u, i) => (
                              <button key={u} type="button" onClick={() => setViewPhoto(u)} title={`ดูรูปบิล ${i + 1}`}>
                                <img src={u} alt="bill" className="w-9 h-9 object-cover rounded border border-slate-300" />
                              </button>
                            ))}
                            <span className="font-black text-orange-700">-{fmt(Math.abs(Number(r.amount)))}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 sticky bottom-0">
              <button onClick={close} className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {viewPhoto && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4" onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="bill" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </>
  );
}
