import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AnomalyReviewModalProps {
  room: { roomId: string; roomNo: string; location: string };
  session: { startTime: Date; endTime: Date; durationMins: number; avgW: number; id: number };
  onClose: () => void;
  onSuccess: () => void;
}

export default function AnomalyReviewModal({ room, session, onClose, onSuccess }: AnomalyReviewModalProps) {
  const [status, setStatus] = useState<"fraud" | "normal">("normal");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    let evidence_urls: string[] = [];

    // อัปโหลดไฟล์ถ้ามี
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${room.roomId}_${session.startTime.getTime()}_${Math.random()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audit_evidence')
        .upload(fileName, file);

      if (uploadError) {
        alert("อัปโหลดไฟล์ไม่สำเร็จ: " + uploadError.message);
        setLoading(false);
        return;
      }

      if (uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from('audit_evidence')
          .getPublicUrl(uploadData.path);
        
        if (publicUrlData) {
          evidence_urls.push(publicUrlData.publicUrl);
        }
      }
    }

    // บันทึกลงฐานข้อมูล
    const { error } = await supabase
      .from('anomaly_reviews')
      .insert({
        room_id: room.roomId,
        session_start_time: session.startTime.toISOString(),
        session_end_time: session.endTime.toISOString(),
        duration_mins: session.durationMins,
        avg_watt: session.avgW,
        status: status,
        reason: reason,
        evidence_urls: evidence_urls
      });

    setLoading(false);

    if (error) {
      alert("บันทึกไม่สำเร็จ: " + error.message);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-black text-slate-800">ระบุสาเหตุความผิดปกติ</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
            <p><strong>ห้อง:</strong> {room.roomNo} ({room.location})</p>
            <p><strong>เวลา:</strong> {session.startTime.toLocaleString('th-TH')} - {session.endTime.toLocaleTimeString('th-TH')}</p>
            <p><strong>ใช้เวลา:</strong> {session.durationMins} นาที <strong>(เฉลี่ย {session.avgW}W)</strong></p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ประเภทความผิดปกติ</label>
            <div className="flex gap-3">
              <button
                onClick={() => setStatus("normal")}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${status === 'normal' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                ✅ ปกติ (มีเหตุผล)
              </button>
              <button
                onClick={() => setStatus("fraud")}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-all ${status === 'fraud' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                🚨 ทุจริต (แอบเข้าพัก)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">คำอธิบายข้อเท็จจริง</label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="อธิบายเหตุผล เช่น แม่บ้านเข้าไปทำความสะอาด, ซ่อมแอร์..."
              className="w-full border-slate-200 rounded-xl p-3 text-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
            ></textarea>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">แนบหลักฐาน (รูปภาพ/วิดีโอ)</label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && <p className="text-xs text-slate-500 mt-2">ไฟล์ที่เลือก: {file.name}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="w-full py-3.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกรายงาน"}
          </button>
        </div>
      </div>
    </div>
  );
}
