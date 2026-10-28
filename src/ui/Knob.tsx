import { useRef } from 'react';

interface Props {
  value: number;          // 0-127
  onChange: (v: number) => void;
  label: string;
  /** Bipolar display: arc from center, 64 = C */
  bipolar?: boolean;
  defaultValue?: number;
  size?: number;
}

/** Rotary knob: drag up/down (Shift for fine), wheel, double-click to reset. */
export function Knob({ value, onChange, label, bipolar, defaultValue, size = 40 }: Props) {
  const start = useRef<{ y: number; v: number } | null>(null);
  const reset = defaultValue ?? (bipolar ? 64 : 100);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = start.current.y - e.clientY;
    const v = Math.round(start.current.v + dy * (e.shiftKey ? 0.25 : 1));
    onChange(Math.max(0, Math.min(127, v)));
  };
  const onPointerUp = () => { start.current = null; };
  const onWheel = (e: React.WheelEvent) => { onChange(Math.max(0, Math.min(127, value - Math.sign(e.deltaY) * (e.shiftKey ? 1 : 3)))); };

  // Geometry: 270° sweep from 135° to 405°.
  const r = size / 2 - 4;
  const cx = size / 2, cy = size / 2;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const angle = (v: number) => 135 + (v / 127) * 270;
  const point = (deg: number) => [cx + r * Math.cos(toRad(deg)), cy + r * Math.sin(toRad(deg))];
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from), [x2, y2] = point(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
  };
  const a = angle(value);
  const indicator = bipolar ? arc(angle(64), a) : arc(135, a);
  const [px, py] = point(a);
  const display = bipolar ? (value === 64 ? 'C' : value < 64 ? `L${64 - value}` : `R${value - 64}`) : String(value);

  return (
    <div className="flex flex-col items-center select-none" title={`${label}: ${display} (drag, wheel, double-click resets)`}>
      <svg
        width={size} height={size} className="cursor-ns-resize touch-none"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={onWheel} onDoubleClick={() => onChange(reset)}
      >
        <path d={arc(135, 405)} stroke="#3f3f46" strokeWidth={3} fill="none" strokeLinecap="round" />
        {value !== (bipolar ? 64 : 0) && <path d={indicator} stroke="#a855f7" strokeWidth={3} fill="none" strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r={r - 5} fill="#18181b" stroke="#52525b" strokeWidth={1} />
        <line x1={cx} y1={cy} x2={px * 0.78 + cx * 0.22} y2={py * 0.78 + cy * 0.22} stroke="#e4e4e7" strokeWidth={2} strokeLinecap="round" />
      </svg>
      <span className="text-[10px] text-zinc-400 leading-none mt-0.5">{label}</span>
      <span className="text-[10px] font-mono text-zinc-300 leading-none mt-0.5">{display}</span>
    </div>
  );
}
