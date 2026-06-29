import { scoreColor, scoreLabel } from "@/lib/analytics";

/** SVG donut gauge for a 0–100 score. Pure presentational (server-safe). */
export function ScoreRing({
  score,
  label,
  size = 72,
}: {
  score: number | null;
  label: string;
  size?: number;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pctFilled = score == null ? 0 : score / 100;
  const dash = circumference * pctFilled;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold">
            {score == null ? "—" : score}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px]" style={{ color }}>
          {scoreLabel(score)}
        </div>
      </div>
    </div>
  );
}
