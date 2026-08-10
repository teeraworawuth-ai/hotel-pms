import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AnomalyHistoryProps {
  dateOffset: number;
}

export default function AnomalyHistory({ dateOffset }: AnomalyHistoryProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "fraud" | "normal">("all");

  useEffect(() => {
    fetchHistory();
  }, [dateOffset]);

  const fetchHistory = async () => {
    setLoading(true);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dateOffset);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 6, 45, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const endOfDay = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 6, 44, 59);

    const { data: reviewsData } = await supabase
      .from("anomaly_reviews")
      .select(`
        *,
        rooms (
          room_no,
          location
        )
      `)
      .gte("session_start_time", startOfDay.toISOString())
      .lte("session_start_time", endOfDay.toISOString())
      .order("created_at", { ascending: false });

    if (reviewsData) {
      setData(reviewsData);
    }
    setLoading(false);
  };

  const filteredData = data.filter(item => filterStatus === "all" || item.status === filterStatus);

  if (loading) return <div className="py-10 text-center text-slate-500">กำลังโหลดประวัติ...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-slate-700">รายการที่ตรวจสอบแล้ว</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 text-sm font-bold rounded-lg ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            ทั้งหมด
          </button>
          <button 
            onClick={() => setFilterStatus("fraud")}
            className={`px-3 py-1.5 text-sm font-bold rounded-lg ${filterStatus === 'fraud' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
          >
            🚨 ทุจริต
          </button>
          <button 
            onClick={() => setFilterStatus("normal")}
            className={`px-3 py-1.5 text-sm font-bold rounded-lg ${filterStatus === 'normal' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
          >
            ✅ ปกติ
          </button>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="text-lg font-bold text-slate-700">ไม่มีประวัติการตรวจสอบ</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredData.map(item => (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className={`px-5 py-4 flex justify-between items-start border-b ${item.status === 'fraud' ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl font-black text-slate-800">{item.rooms?.room_no}</span>
                    <span className="text-xs text-slate-500">({item.rooms?.location})</span>
                  </div>
                  <div className="text-sm font-medium text-slate-600">
                    เวลา: {new Date(item.session_start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - {new Date(item.session_end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    <span className="ml-2 text-xs">({item.duration_mins} นาที)</span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${item.status === 'fraud' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                  {item.status === 'fraud' ? '🚨 ทุจริต' : '✅ ปกติ'}
                </div>
              </div>
              
              <div className="p-5 flex-1 bg-slate-50/50">
                <p className="text-sm font-bold text-slate-700 mb-1">สาเหตุ/ข้อเท็จจริง:</p>
                <p className="text-slate-600 text-sm whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200">{item.reason}</p>
                
                {item.evidence_urls && item.evidence_urls.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-bold text-slate-700 mb-2">หลักฐานที่แนบ:</p>
                    <div className="flex flex-wrap gap-2">
                      {item.evidence_urls.map((url: string, idx: number) => {
                        const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
                        return (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block relative group overflow-hidden rounded-lg border border-slate-200 w-24 h-24 bg-slate-100">
                            {isVideo ? (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                              </div>
                            ) : (
                              <img src={url} alt="Evidence" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 bg-white">
                บันทึกเมื่อ: {new Date(item.created_at).toLocaleString('th-TH')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
