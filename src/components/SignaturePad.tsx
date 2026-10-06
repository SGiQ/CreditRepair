"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

const W = 600;
const H = 200;

/** Draw-your-signature box. Calls `onChange` with a PNG data URL, or "" when cleared. */
export function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };

  function clear() {
    ref.current?.getContext("2d")?.clearRect(0, 0, W, H);
    setEmpty(true);
    onChange("");
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          width={W}
          height={H}
          aria-label="Draw your signature here"
          className="w-full touch-none rounded-lg border border-stone-300 bg-white"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = point(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = point(e);
            ctx.lineTo(x, y);
            ctx.stroke();
            if (empty) setEmpty(false);
          }}
          onPointerUp={(e) => {
            if (!drawing.current) return;
            drawing.current = false;
            onChange(e.currentTarget.toDataURL("image/png"));
          }}
        />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-400">Sign here with your finger or mouse</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-stone-300" aria-hidden />
      </div>
      <Button small variant="ghost" type="button" className="mt-1" onClick={clear} disabled={empty}>
        Clear
      </Button>
    </div>
  );
}
