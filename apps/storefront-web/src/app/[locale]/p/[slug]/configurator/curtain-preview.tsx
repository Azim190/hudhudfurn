/**
 * Simple room illustration: the window, and the chosen fabric colour drawn as panels with the
 * heading's fold pattern (wave curves, pleats, eyelets) or a flat blind. Proportions follow the
 * entered width and height so the customer sees roughly how the treatment will hang.
 */
export function CurtainPreview({ kind, color, widthMm, heightMm, panels, heading, label }: { kind: 'CURTAIN' | 'BLIND'; color: string; widthMm?: number; heightMm?: number; panels: number; heading?: string; label: string }) {
  const W = 320;
  const H = 220;
  const ratio = widthMm && heightMm ? Math.min(2.2, Math.max(0.5, widthMm / heightMm)) : 1.2;
  const winH = 150;
  const winW = Math.min(250, winH * ratio);
  const x0 = (W - winW) / 2;
  const y0 = 30;
  const folds = heading === 'PINCH_PLEAT' ? 7 : heading === 'EYELET' ? 5 : 6;
  const panelCount = Math.max(1, Math.min(panels, 4));
  const overhang = 14;
  const totalW = winW + overhang * 2;
  const panelW = totalW / panelCount / (kind === 'CURTAIN' ? 1.6 : 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full rounded-card bg-sand-100">
      <rect x="0" y="0" width={W} height={H} fill="#f3eee6" />
      <rect x="0" y={H - 26} width={W} height="26" fill="#d9cdb8" />
      {/* window */}
      <rect x={x0} y={y0} width={winW} height={winH} fill="#cfe3ee" stroke="#ffffff" strokeWidth="6" />
      <line x1={W / 2} y1={y0} x2={W / 2} y2={y0 + winH} stroke="#ffffff" strokeWidth="4" />
      {kind === 'BLIND' ? (
        <g>
          <rect x={x0} y={y0 - 4} width={winW} height={winH * 0.62} fill={color} opacity="0.95" />
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={x0} x2={x0 + winW} y1={y0 + ((i + 1) * winH * 0.62) / 7} y2={y0 + ((i + 1) * winH * 0.62) / 7} stroke="#000" strokeOpacity="0.12" />
          ))}
          <rect x={x0 - 4} y={y0 - 8} width={winW + 8} height="8" rx="2" fill="#9a8f80" />
        </g>
      ) : (
        <g>
          <rect x={x0 - overhang - 6} y={y0 - 12} width={totalW + 12} height="5" rx="2" fill="#8b8072" />
          {Array.from({ length: panelCount }, (_, p) => {
            // Pairs gather towards the sides; a single panel hangs on the starting side.
            const left = panelCount === 1 ? x0 - overhang : p < panelCount / 2 ? x0 - overhang + p * panelW : x0 + winW + overhang - (panelCount - p) * panelW;
            const bottom = y0 + winH + 34;
            const step = panelW / folds;
            const path = Array.from({ length: folds + 1 }, (_, i) => {
              const x = left + i * step;
              const wave = heading === 'WAVE' ? (i % 2 === 0 ? -3 : 3) : 0;
              return `${i === 0 ? 'M' : 'L'}${x + wave},${y0 - 7}`;
            }).join(' ');
            return (
              <g key={p}>
                <path d={`${path} L${left + panelW},${bottom} L${left},${bottom} Z`} fill={color} opacity="0.96" />
                {Array.from({ length: folds - 1 }, (_, i) => (
                  <line key={i} x1={left + (i + 1) * step} x2={left + (i + 1) * step + (heading === 'WAVE' ? 2 : 0)} y1={y0 - 6} y2={bottom} stroke="#000" strokeOpacity={i % 2 ? 0.08 : 0.16} strokeWidth={heading === 'PINCH_PLEAT' ? 2 : 1.4} />
                ))}
                {heading === 'EYELET' && Array.from({ length: folds }, (_, i) => <circle key={i} cx={left + (i + 0.5) * step} cy={y0 - 2} r="2.4" fill="#d6c7a8" />)}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
