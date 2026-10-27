"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
};

type Props = {
  label?: string;
  height?: number;
  onChange?: (hasSignature: boolean) => void;
};

/** แผ่นเซ็นชื่อบนหน้าจอ (รองรับเมาส์/นิ้ว/ปากกา) */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label, height = 120, onChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  };

  const handleUp = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => !hasInk,
    toDataURL: () => (hasInk && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
  }));

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        {label && <span className="block text-sm font-bold text-slate-700">{label}</span>}
        <button type="button" onClick={clear} className="text-xs text-blue-500 underline">
          ลบและเซ็นใหม่
        </button>
      </div>
      <div
        className={`border-2 border-dashed rounded-xl overflow-hidden bg-slate-50 touch-none ${
          hasInk ? "border-emerald-300" : "border-slate-300"
        }`}
      >
        <canvas
          ref={canvasRef}
          width={500}
          height={170}
          style={{ height }}
          className="w-full cursor-crosshair"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
        />
      </div>
    </div>
  );
});

export default SignaturePad;
