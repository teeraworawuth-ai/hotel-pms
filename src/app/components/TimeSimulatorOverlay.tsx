"use client";

import React, { useState, useEffect } from "react";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";

export default function TimeSimulatorOverlay() {
  const { simulatedTime, setSimulatedTime, getNow } = useSimulatedTime();
  const [isOpen, setIsOpen] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");

  const [currentDisplay, setCurrentDisplay] = useState("");

  useEffect(() => {
    // Initial display string
    setCurrentDisplay(getNow().toLocaleString('th-TH'));

    const interval = setInterval(() => {
      setCurrentDisplay(getNow().toLocaleString('th-TH'));
    }, 1000);
    return () => clearInterval(interval);
  }, [getNow, simulatedTime]);

  // Load state when we have simulatedTime
  useEffect(() => {
    if (simulatedTime) {
      // pad function for 2 digits
      const pad = (n: number) => n.toString().padStart(2, '0');
      setDateInput(`${simulatedTime.getFullYear()}-${pad(simulatedTime.getMonth() + 1)}-${pad(simulatedTime.getDate())}`);
      setTimeInput(`${pad(simulatedTime.getHours())}:${pad(simulatedTime.getMinutes())}`);
    } else {
      setDateInput("");
      setTimeInput("");
    }
  }, [simulatedTime]);

  const handleSimulate = async () => {
    if (!dateInput || !timeInput) return;
    const newDate = new Date(`${dateInput}T${timeInput}`);
    setSimulatedTime(newDate);
    
    // Auto-trigger Night Audit if time >= 09:45
    const hours = newDate.getHours();
    const minutes = newDate.getMinutes();
    if (hours > 9 || (hours === 9 && minutes >= 45)) {
      try {
        const res = await fetch(`/api/cron/night-audit?simulated_date=${newDate.toISOString()}`, { method: 'POST' });
        const data = await res.json();
        console.log('Simulated Night Audit triggered:', data);
        if (data.posted > 0) {
          alert(`บอททำงานอัตโนมัติ: ดึงค่าห้องพักเข้ามา ${data.posted} รายการ`);
          window.location.reload(); // Refresh to show new charges
        }
      } catch (err) {
        console.error('Failed to trigger simulated night audit', err);
      }
    }
  };

  const handleReset = () => {
    setSimulatedTime(null);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-slate-800 text-white p-3 rounded-full shadow-lg opacity-50 hover:opacity-100 transition-opacity"
      >
        ⏱️ Time
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] bg-white border border-slate-200 shadow-xl rounded-xl p-4 w-72 animate-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-slate-700">⏱️ Time Simulator</h3>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>

      <div className="text-xs mb-3 text-slate-500">
        Current Time: <span className="font-mono font-bold text-slate-800">{currentDisplay}</span>
        {simulatedTime && <span className="text-amber-500 ml-2 block">(Simulated)</span>}
      </div>

      <div className="space-y-2 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
          <input 
            type="date" 
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="w-full text-sm border-slate-300 rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
          <input 
            type="time" 
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            className="w-full text-sm border-slate-300 rounded px-2 py-1"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={handleSimulate}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded"
        >
          Set Time
        </button>
        <button 
          onClick={handleReset}
          className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2 rounded"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
