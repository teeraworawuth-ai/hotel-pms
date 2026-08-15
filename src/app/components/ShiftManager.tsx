"use client";

import { useState, useRef, useEffect } from "react";
import { useShift } from "@/contexts/ShiftContext";
import { supabase } from "@/lib/supabase";

export default function ShiftManager() {
  const { activeShift, loading, refreshShift } = useShift();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  
  // Open Shift State
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [initialCash, setInitialCash] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Close Shift State
  const [finalCash, setFinalCash] = useState(0);
  const [closePin, setClosePin] = useState("");
  
  // Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Initialize Canvas
  useEffect(() => {
    if (showCloseModal && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
      }
    }
  }, [showCloseModal]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleOpenShift = async () => {
    setErrorMsg("");
    const upperName = name.toUpperCase();
    
    // 1. Verify Staff
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('name', upperName)
      .eq('pin', pin)
      .single();

    if (staffError || !staffData) {
      setErrorMsg("ชื่อพนักงานหรือรหัส PIN ไม่ถูกต้อง");
      return;
    }

    // 2. Create Shift
    const { error: shiftError } = await supabase
      .from('shifts')
      .insert({
        staff_id: staffData.id,
        staff_name: staffData.name,
        initial_cash: initialCash,
        expected_cash: initialCash, // ตอนเริ่มกะ expected = initial
        status: 'open'
      });

    if (shiftError) {
      setErrorMsg("เกิดข้อผิดพลาดในการเปิดกะ");
      return;
    }

    setShowOpenModal(false);
    setName("");
    setPin("");
    setInitialCash(0);
    refreshShift();
  };

  const handleCloseShift = async () => {
    setErrorMsg("");
    if (!activeShift) return;

    // Verify PIN again to close
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('name', activeShift.staff_name)
      .eq('pin', closePin)
      .single();

    if (staffError || !staffData) {
      setErrorMsg("รหัส PIN ไม่ถูกต้อง");
      return;
    }

    // Get Signature
    const signatureData = canvasRef.current?.toDataURL("image/png");

    const discrepancy = finalCash - activeShift.expected_cash;

    const { error: shiftError } = await supabase
      .from('shifts')
      .update({
        end_time: new Date().toISOString(),
        final_cash: finalCash,
        discrepancy: discrepancy,
        status: 'closed',
        signature_data: signatureData
      })
      .eq('id', activeShift.id);

    if (shiftError) {
      setErrorMsg("เกิดข้อผิดพลาดในการปิดกะ");
      return;
    }

    setShowCloseModal(false);
    setClosePin("");
    setFinalCash(0);
    refreshShift();
  };

  if (loading) return <div className="text-xs opacity-50">Checking shift...</div>;

  return (
    <div>
      {!activeShift ? (
        <button 
          onClick={() => setShowOpenModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm flex items-center gap-2 animate-pulse"
        >
          <span>เปิดกะ (Open Shift)</span>
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500 font-medium">กะปัจจุบัน: <span className="text-slate-800 font-bold">{activeShift.staff_name}</span></div>
            <div className="text-[10px] text-emerald-600 font-bold">เงินในลิ้นชัก: ฿{activeShift.expected_cash.toLocaleString()}</div>
          </div>
          <button 
            onClick={() => setShowCloseModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm"
          >
            ปิดกะ
          </button>
        </div>
      )}

      {/* OPEN SHIFT MODAL */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-800 mb-4">เปิดกะ (Open Shift)</h3>
              
              {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{errorMsg}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อพนักงาน (Staff Name)</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full uppercase p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ADMIN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN 4 หลัก</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">เงินทอนเริ่มต้นในลิ้นชัก (Initial Cash)</label>
                  <input 
                    type="number" 
                    value={initialCash}
                    onChange={(e) => setInitialCash(Number(e.target.value))}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowOpenModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl">ยกเลิก</button>
              <button onClick={handleOpenShift} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl">ยืนยันการเปิดกะ</button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE SHIFT MODAL */}
      {showCloseModal && activeShift && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-800 mb-1">ปิดกะและส่งเงิน (Close Shift)</h3>
              <p className="text-sm text-slate-500 mb-4">พนักงาน: {activeShift.staff_name}</p>
              
              {errorMsg && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{errorMsg}</div>}

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                <div className="flex justify-between items-center mb-2 text-slate-600">
                  <span>เงินทอนเริ่มต้น:</span>
                  <span>฿{activeShift.initial_cash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-black text-emerald-700 pt-2 border-t border-slate-200">
                  <span>ยอดที่ควรมีในลิ้นชัก:</span>
                  <span>฿{activeShift.expected_cash.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ยอดเงินสดที่นับได้จริง (Final Cash Count)</label>
                  <input 
                    type="number" 
                    value={finalCash}
                    onChange={(e) => setFinalCash(Number(e.target.value))}
                    className="w-full text-2xl text-center font-bold text-blue-600 p-3 rounded-xl border border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-blue-50"
                  />
                  {finalCash !== 0 && finalCash !== activeShift.expected_cash && (
                    <p className={	ext-xs mt-1 font-bold }>
                      {finalCash > activeShift.expected_cash ? 'ยอดเงินเกิน' : 'ยอดเงินขาด'}: ฿{Math.abs(finalCash - activeShift.expected_cash).toLocaleString()}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex justify-between">
                    ลายเซ็นผู้ส่งกะ (Signature)
                    <button onClick={clearSignature} className="text-xs text-blue-500 font-normal underline">ลบและเซ็นใหม่</button>
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50 touch-none">
                    <canvas 
                      ref={canvasRef}
                      width={400}
                      height={150}
                      className="w-full h-[120px] cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">รหัส PIN ยืนยัน</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={closePin}
                    onChange={(e) => setClosePin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] text-xl p-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="••••"
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowCloseModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl">ยกเลิก</button>
              <button onClick={handleCloseShift} disabled={!finalCash || !closePin || closePin.length < 4} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-xl disabled:opacity-50">ยืนยันส่งกะ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
