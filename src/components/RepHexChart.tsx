import type { RepScoreBreakdown } from '../types/squat';

interface RepHexChartProps {
  breakdown: RepScoreBreakdown;
  /** Optional faint overlay, e.g. the session average for comparison. */
  reference?: RepScoreBreakdown | null;
}

const AXES: Array<{ key: keyof RepScoreBreakdown; label: string }> = [
  { key: 'depth', label: '깊이' },
  { key: 'knee', label: '무릎' },
  { key: 'posture', label: '상체' },
  { key: 'balance', label: '균형' },
  { key: 'tempo', label: '템포' },
  { key: 'stability', label: '안정성' },
];

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 72;
const RINGS = [0.25, 0.5, 0.75, 1];

// Start at the top (-90°) and step clockwise by 60°.
function axisAngle(index: number): number {
  return (-90 + index * 60) * (Math.PI / 180);
}

function pointAt(index: number, radius: number): [number, number] {
  const angle = axisAngle(index);
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

function polygon(values: number[]): string {
  return values
    .map((value, index) => {
      const [x, y] = pointAt(index, (clampScore(value) / 100) * RADIUS);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function clampScore(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

export function RepHexChart({ breakdown, reference }: RepHexChartProps) {
  const values = AXES.map((axis) => breakdown[axis.key]);
  const referenceValues = reference ? AXES.map((axis) => reference[axis.key]) : null;

  return (
    <svg className="hex-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="반복 점수 6각형 차트">
      {/* grid rings */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          className="hex-chart__ring"
          points={AXES.map((_, index) => pointAt(index, ring * RADIUS).map((n) => n.toFixed(1)).join(',')).join(' ')}
        />
      ))}

      {/* axis spokes + labels */}
      {AXES.map((axis, index) => {
        const [x, y] = pointAt(index, RADIUS);
        const [lx, ly] = pointAt(index, RADIUS + 16);
        return (
          <g key={axis.key}>
            <line className="hex-chart__spoke" x1={CENTER} y1={CENTER} x2={x} y2={y} />
            <text className="hex-chart__label" x={lx} y={ly} dominantBaseline="middle" textAnchor="middle">
              {axis.label}
            </text>
          </g>
        );
      })}

      {referenceValues && (
        <polygon className="hex-chart__reference" points={polygon(referenceValues)} />
      )}

      <polygon className="hex-chart__value" points={polygon(values)} />

      {/* value vertices */}
      {values.map((value, index) => {
        const [x, y] = pointAt(index, (clampScore(value) / 100) * RADIUS);
        return <circle key={AXES[index].key} className="hex-chart__dot" cx={x} cy={y} r={2.5} />;
      })}
    </svg>
  );
}
