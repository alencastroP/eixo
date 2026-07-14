type BrandVariant = 'orange' | 'white' | 'asphalt' | 'chrome';

const COLORS: Record<BrandVariant, string> = {
  orange: '#FF6B35', // assinatura/ponto focal
  white: '#F5F6F7', // sobre superfícies escuras
  asphalt: '#14171A', // sobre superfícies claras
  chrome: '#C9CDD3', // detalhe premium — usar com moderação
};

interface BrandMarkProps {
  variant?: BrandVariant;
  size?: number;
  /** Brilho sutil (usado nos pontos de destaque: rail e login). */
  glow?: boolean;
  className?: string;
}

/** Marca "Eixo" — ícone oficial da identidade visual, nas 4 variantes de cor definidas na marca. */
export function BrandMark({ variant = 'orange', size = 24, glow = false, className }: BrandMarkProps) {
  const color = COLORS[variant];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 130 130"
      fill="none"
      style={glow ? { filter: `drop-shadow(0 0 6px ${color}b3)` } : undefined}
      aria-hidden
    >
      <path d="M 25,60 L 85,60" stroke={color} strokeWidth="15" fill="none" strokeLinecap="round" />
      <path d="M 70,85.98 A 30,30 0 1,1 80.98,75" stroke={color} strokeWidth="15" fill="none" strokeLinecap="round" />
      <path d="M 70,85.98 Q 74,93 82,90" stroke={color} strokeWidth="15" fill="none" strokeLinecap="round" />
    </svg>
  );
}
