import type { CSSProperties } from 'react';
import type { ScoreBand } from '../types';

interface ScoreGaugeProps {
  score: number; // 0..1000
  band: ScoreBand;
  size?: number;
}

const ZONES = [
  { from: 0, to: 300, color: '#E5484D' }, // risco alto
  { from: 300, to: 700, color: '#FFB020' }, // risco médio
  { from: 700, to: 1000, color: '#2ECC71' }, // risco baixo
];

const BAND_COLOR: Record<ScoreBand, string> = {
  HIGH_RISK: '#E5484D',
  MEDIUM_RISK: '#FFB020',
  LOW_RISK: '#2ECC71',
};

const MAX = 1000;

/** Converte um valor de score (0..MAX) em ponto (x,y) sobre o semicírculo superior. */
function pointAt(value: number, cx: number, cy: number, r: number) {
  const t = Math.max(0, Math.min(1, value / MAX));
  const angle = Math.PI - t * Math.PI; // 180° (esquerda) → 0° (direita)
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

function arcPath(from: number, to: number, cx: number, cy: number, r: number) {
  const start = pointAt(from, cx, cy, r);
  const end = pointAt(to, cx, cy, r);
  // sweep-flag 1 desenha o arco por cima (sentido horário na tela)
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

/**
 * Velocímetro do Score — tacômetro semicircular com 3 zonas de risco e ponteiro.
 * Puro SVG, sem dependências.
 *
 * Movimento (design system): as zonas se desenham em cascata de 120ms e o
 * ponteiro varre da base do mostrador até a leitura, na curva padrão do
 * sistema. O traço nasce do comprimento real de cada arco, então a animação
 * acompanha qualquer tamanho de gauge.
 */
export function ScoreGauge({ score, band, size = 300 }: ScoreGaugeProps) {
  const cx = size / 2;
  const r = size / 2 - 22;
  const cy = size / 2 + 4; // baseline do semicírculo
  const height = cy + 26;
  const stroke = 20;

  const needle = pointAt(score, cx, cy, r - 6);
  const needleColor = BAND_COLOR[band];

  // marcações a cada 100 pontos
  const ticks = Array.from({ length: 11 }, (_, i) => i * 100);

  // ângulo final do ponteiro: -90° na base (score 0) → +90° (score máximo)
  const needleAngle = (Math.max(0, Math.min(MAX, score)) / MAX) * 180 - 90;

  return (
    <svg viewBox={`0 0 ${size} ${height}`} width={size} className="score-gauge" role="img" aria-label={`Score ${score}`}>
      {/* trilho de fundo */}
      <path d={arcPath(0, MAX, cx, cy, r)} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" />

      {/* zonas coloridas — cada uma se desenha da esquerda para a direita */}
      {ZONES.map((z, i) => {
        const from = z.from + (z.from === 0 ? 0 : 6);
        const to = z.to - (z.to === MAX ? 0 : 6);
        const len = (Math.PI * r * (to - from)) / MAX;
        return (
          <path
            key={z.from}
            d={arcPath(from, to, cx, cy, r)}
            fill="none"
            stroke={z.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            opacity={0.9}
            strokeDasharray={len}
            style={
              {
                '--arc-len': String(len),
                animation: `ds-arc 900ms ${i * 120}ms var(--ease) both`,
              } as CSSProperties
            }
          />
        );
      })}

      {/* marcações */}
      {ticks.map((t) => {
        const outer = pointAt(t, cx, cy, r - stroke / 2 - 4);
        const inner = pointAt(t, cx, cy, r - stroke / 2 - 11);
        return (
          <line
            key={t}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke="var(--text-3)"
            strokeWidth={t % 500 === 0 ? 2 : 1}
            opacity={0.6}
          />
        );
      })}

      {/* rótulos das extremidades */}
      <text x={pointAt(0, cx, cy, r).x - 2} y={cy + 18} className="gauge-scale" textAnchor="middle">
        0
      </text>
      <text x={pointAt(MAX, cx, cy, r).x + 2} y={cy + 18} className="gauge-scale" textAnchor="middle">
        1000
      </text>

      {/* ponteiro — varre da base até a leitura */}
      <g
        style={
          {
            transformOrigin: `${cx}px ${cy}px`,
            transformBox: 'view-box',
            // parte da base do mostrador (score 0) e varre até a leitura real
            '--needle-from': `${-90 - needleAngle}deg`,
            animation: 'ds-needle 1000ms 260ms var(--ease) both',
          } as CSSProperties
        }
      >
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={needleColor} strokeWidth={4} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={9} fill={needleColor} />
        <circle cx={cx} cy={cy} r={4} fill="var(--surface)" />
      </g>

      {/* leitura acessível fora da animação */}
      <title>{`Score ${score} de ${MAX}`}</title>
      <desc>{`Ponteiro em ${needleAngle.toFixed(0)} graus`}</desc>
    </svg>
  );
}
