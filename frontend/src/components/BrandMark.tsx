/**
 * Identidade visual do Eixo.
 *
 * A marca é geometria pura - três barras arredondadas formando o "E", e as
 * letras I, X e O construídas com retângulo, dois paralelogramos e um anel.
 * Por isso ela mora aqui como SVG e não como imagem: fica nítida em qualquer
 * tamanho, acompanha o tema sem precisar de dois arquivos, não custa
 * requisição e o laranja sai do mesmo token dos botões (`--accent`), então a
 * marca nunca destoa da interface.
 *
 * Todas as variantes são SEM FUNDO. As versões com fundo (ladrilho claro e
 * escuro) existem como arquivo em `public/brand/`, para os lugares que exigem
 * um retângulo opaco - favicon, ícone de app, imagem de compartilhamento.
 */

type BrandVariant = 'orange' | 'white' | 'asphalt' | 'chrome' | 'duo';

/** Grafite da marca. Um só valor para símbolo e palavra - se divergissem, a
 *  assinatura mostraria dois pretos ligeiramente diferentes lado a lado. */
const INK = '#26262B';

const COLORS: Record<Exclude<BrandVariant, 'duo'>, string> = {
  orange: 'var(--accent)', // assinatura/ponto focal
  white: '#FFFFFF', // sobre superfícies escuras
  asphalt: INK, // sobre superfícies claras
  chrome: '#C9CDD3', // detalhe premium - usar com moderação
};

// ─── Geometria da marca ──────────────────────────────────────────────────────
// Grade de 100 × 106: barra 28 de altura, respiro 11, barra do meio a 70% da
// largura. Mexer nestes números muda a marca - não são valores de layout.
const BAR = 28;
const GAP = 11;
const LONG = 100;
const SHORT = 70;
const RADIUS = 6;
const MARK_H = BAR * 3 + GAP * 2; // 106

/** Cor de cada barra. Em `duo` a do meio é o acento, como na versão de assinatura. */
function barColors(variant: BrandVariant): [string, string, string] {
  if (variant === 'duo') return [COLORS.asphalt, 'var(--accent)', COLORS.asphalt];
  const c = COLORS[variant];
  return [c, c, c];
}

/**
 * As cores vão em `style`, e não no atributo `fill`: atributo de apresentação
 * com `var()` não é resolvido de forma confiável em todos os navegadores, e é
 * justamente do token `--accent` que sai o laranja.
 */
function Bars({ variant }: { variant: BrandVariant }) {
  const [top, middle, bottom] = barColors(variant);
  return (
    <>
      <rect x="0" y="0" width={LONG} height={BAR} rx={RADIUS} style={{ fill: top }} />
      <rect x="0" y={BAR + GAP} width={SHORT} height={BAR} rx={RADIUS} style={{ fill: middle }} />
      <rect x="0" y={(BAR + GAP) * 2} width={LONG} height={BAR} rx={RADIUS} style={{ fill: bottom }} />
    </>
  );
}

interface BrandMarkProps {
  variant?: BrandVariant;
  /** Altura em px - a largura acompanha a proporção da marca (100 : 106). */
  size?: number;
  /** Brilho sutil (usado nos pontos de destaque: rail e login). */
  glow?: boolean;
  className?: string;
}

/** Símbolo "E" do Eixo, sem fundo. */
export function BrandMark({ variant = 'orange', size = 24, glow = false, className }: BrandMarkProps) {
  const color = variant === 'duo' ? 'var(--accent)' : COLORS[variant];
  return (
    <svg
      className={className}
      height={size}
      width={(size * LONG) / MARK_H}
      viewBox={`0 0 ${LONG} ${MARK_H}`}
      fill="none"
      style={glow ? { filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 70%, transparent))` } : undefined}
      role="img"
      aria-label="Eixo"
    >
      <Bars variant={variant} />
    </svg>
  );
}

// ─── Assinatura completa (símbolo + "IXO") ───────────────────────────────────
// O símbolo É o E da palavra: a assinatura não repete a letra, continua dela.
const I_X = 140; // respiro entre o símbolo e a palavra
const I_W = 27; // espessura da haste - a mesma das barras, para a palavra "pesar" igual
const X_X = 191;
const X_W = 84;
const O_X = 299;
const O_W = 96;
const LOGO_W = O_X + O_W; // 395

type LogoTone = 'onDark' | 'onLight' | 'white' | 'asphalt';

/** Cor da palavra. O símbolo fica laranja, exceto nas versões de uma cor só. */
const WORD_COLOR: Record<LogoTone, string> = {
  onDark: COLORS.white,
  onLight: INK,
  white: COLORS.white,
  asphalt: INK,
};

export function BrandLogo({
  tone = 'onLight',
  size = 32,
  className,
}: {
  /** `onDark`/`onLight` mantêm o símbolo laranja; `white`/`asphalt` são de uma cor só. */
  tone?: LogoTone;
  /** Altura em px. */
  size?: number;
  className?: string;
}) {
  const word = WORD_COLOR[tone];
  const markVariant: BrandVariant = tone === 'white' ? 'white' : tone === 'asphalt' ? 'asphalt' : 'orange';

  return (
    <svg
      className={className}
      height={size}
      width={(size * LOGO_W) / MARK_H}
      viewBox={`0 0 ${LOGO_W} ${MARK_H}`}
      fill="none"
      role="img"
      aria-label="Eixo"
    >
      <Bars variant={markVariant} />
      <rect x={I_X} y="0" width={I_W} height={MARK_H} style={{ fill: word }} />
      {/* X: dois paralelogramos cruzados - mesma espessura da haste do I */}
      <polygon
        points={`${X_X},0 ${X_X + I_W},0 ${X_X + X_W},${MARK_H} ${X_X + X_W - I_W},${MARK_H}`}
        style={{ fill: word }}
      />
      <polygon
        points={`${X_X + X_W},0 ${X_X + X_W - I_W},0 ${X_X},${MARK_H} ${X_X + I_W},${MARK_H}`}
        style={{ fill: word }}
      />
      <ellipse
        cx={O_X + O_W / 2}
        cy={MARK_H / 2}
        rx={(O_W - I_W) / 2}
        ry={(MARK_H - I_W) / 2}
        style={{ fill: 'none', stroke: word, strokeWidth: I_W }}
      />
    </svg>
  );
}
