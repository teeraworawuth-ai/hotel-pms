"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  roomId: string;
  roomNo: string;
  onClose: () => void;
}

// เพิ่มรูป/หมายเหตุให้รอบทำความสะอาดที่กำลังทำอยู่ (ไม่บังคับ)
export default function CleaningNoteModal({ roomId, roomNo, onClose }: Props) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = async () => {
    if (!note.trim() && files.length === 0) { onClose(); return; }
    setSaving(true);
    setMsg("");
    try {
      const { data } = await supabase
        .from("housekeeping_logs")
        .select("id, photo_urls, note")
        .eq("room_id", roomId)
        .eq("status", "cleaning")
        .order("started_at", { ascending: false })
        .limit(1);
      const log = data && data[0];
      if (!log) { setMsg("ไม่พบรอบทำความสะอาดที่กำลังทำอยู่"); setSaving(false); return; }

      const urls: string[] = [...(log.photo_urls || [])];
      for (const f of files) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${roomId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("housekeeping-photos").upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        urls.push(supabase.storage.from("housekeeping-photos").getPublicUrl(path).data.publicUrl);
      }
      const newNote = [log.note, note.trim()].filter(Boolean).join(" / ");
      const { error } = await supabase.from("housekeeping_logs").update({ photo_urls: urls, note: newNote || null }).eq("id", log.id);
      if (error) throw error;
      onClose();
    } catch (e: any) {
      setMsg("บันทึกไม่สำเร็จ: " + (e?.message || "ไม่ทราบสาเหตุ"));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800">🧹 ห้อง {roomNo} - รูป/หมายเหตุ</h3>
        <label className="block">
          <span className="text-sm font-bold text-slate-600">ถ่าย/เลือกรูป (ไม่บังคับ)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="mt-1 block w-full text-sm"
          />
          {files.length > 0 && <span className="text-xs text-slate-500">เลือกแล้ว {files.length} รูป</span>}
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="หมายเหตุ เช่น ผ้าปูเปื้อน, ของหาย (ไม่บังคับ)"
          className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-blue-500"
          rows={3}
        />
        {msg && <p className="text-red-500 text-sm">{msg}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100">ปิด</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl font-bold bg-blue-600 text-white disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
