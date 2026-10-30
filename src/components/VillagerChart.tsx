import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { clock, formatClock, RESOURCES, totalVillagers, villagerTimeline, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { SplitChips } from "./PlanTree";

const W = 600;
const H = 190;
const PAD_TOP = 18;

/**
 * Villagers on each resource over the chosen path, as stacked bands: the
 * shape shows at a glance when to shift from sheep to wood, gold or stone.
 * With `now` (seconds into a live game) a Now line follows the game and the
 * readout shows the split you should have at that moment.
 */
export function VillagerChart({ plan, path, now }: { plan: GamePlan; path: SelectedPath; now?: number | null }) {
  const points = useMemo(() => villagerTimeline(plan, path), [plan, path]);
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;
  const feudalAt = clock(path.feudal.ageUp);
  const castleAt = clock(path.castle.ageUp);
  const end = Math.max(points[points.length - 1].seconds + 45, castleAt + 30, now != null ? now + 30 : 0);
  const maxVils = Math.max(...points.map(totalVillagers), 10);
  const x = (s: number) => (s / end) * W;
  const y = (n: number) => H - (n / maxVils) * (H - PAD_TOP);

  // Step-after stacks: each band holds its value until the next point.
  const layers = [...RESOURCES.map((_, i) => i), 4].map((layer) => {
    const lower = (p: (typeof points)[number]) => p.split.slice(0, Math.min(layer, 4)).reduce((a, b) => a + b, 0);
    const upper = (p: (typeof points)[number]) => lower(p) + (layer < 4 ? p.split[layer] : p.builders);
    const top: string[] = [];
    const bottom: string[] = [];
    points.forEach((p, i) => {
      const nextX = x(i + 1 < points.length ? points[i + 1].seconds : end);
      top.push(`${x(p.seconds)},${y(upper(p))}`, `${nextX},${y(upper(p))}`);
      bottom.unshift(`${nextX},${y(lower(p))}`, `${x(p.seconds)},${y(lower(p))}`);
    });
    return { layer, d: `M${top.join(" L")} L${bottom.join(" L")} Z` };
  });

  const at = hover ?? now ?? null;
  const active = at === null ? null : ([...points].reverse().find((p) => p.seconds <= at) ?? points[0]);
  const onMove = (e: React.MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setHover(((e.clientX - box.left) / box.width) * end);
  };

  const bands = [
    { label: "Dark", from: 0, to: feudalAt },
    { label: "Feudal", from: feudalAt, to: castleAt },
    { label: "Castle", from: castleAt, to: end },
  ];

  return (
    <div className="vil-chart">
      <div className="vil-chart-head">
        <span className="section-kicker">Villagers</span>
        {active ? (
          <span className="vil-readout">
            <span className="t">{formatClock(active.seconds)}</span>
            <SplitChips split={active.split} builders={active.builders} />
            <span className="muted small">{totalVillagers(active)} total</span>
          </span>
        ) : (
          <span className="muted small">Hover to read the split at any time</span>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H + 16}`}
        className="vil-svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Villagers on each resource over time"
      >
        {bands.map((b, i) => (
          <g key={b.label}>
            <rect x={x(b.from)} y={0} width={Math.max(0, x(b.to) - x(b.from))} height={H} className={`age-band band-${i}`} />
            <text x={x(b.from) + 4} y={11} className="band-label">
              {b.label}
            </text>
          </g>
        ))}
        {layers.map(({ layer, d }) => (
          <motion.path
            key={`${path.feudal.id}-${path.castle.id}-${layer}`}
            d={d}
            className={`vil-layer ${layer < 4 ? RESOURCES[layer] : "builders"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: layer * 0.05 }}
          />
        ))}
        {[feudalAt, castleAt].map((s) => (
          <line key={s} x1={x(s)} x2={x(s)} y1={0} y2={H} className="age-line" />
        ))}
        {points.map((p) => (
          <circle key={p.seconds} cx={x(p.seconds)} cy={H + 6} r={2.5} className="step-dot" />
        ))}
        {[0, 120, 240, 360, 480, 600, 720, 840].filter((s) => s < end).map((s) => (
          <text key={s} x={x(s)} y={H + 15} className="tick">
            {s / 60}m
          </text>
        ))}
        {now != null && <line x1={x(now)} x2={x(now)} y1={0} y2={H} className="now-line" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="hover-line" />}
      </svg>
    </div>
  );
}
