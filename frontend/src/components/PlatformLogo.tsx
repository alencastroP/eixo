import { platformLabel } from '../types';

/** Marca visual de cada plataforma (monograma sobre a cor da marca). */
const BRAND: Record<string, { bg: string; fg: string; mark: string }> = {
  olx: { bg: '#6E0AD6', fg: '#ffffff', mark: 'OLX' },
  mercadolivre: { bg: '#FFE600', fg: '#2D3277', mark: 'ML' },
  webmotors: { bg: '#E5484D', fg: '#ffffff', mark: 'W' },
  manual: { bg: '#262B30', fg: '#C9CDD3', mark: '✎' },
};

export function PlatformLogo({ platform, size = 44 }: { platform: string; size?: number }) {
  const brand = BRAND[platform] ?? { bg: '#262B30', fg: '#C9CDD3', mark: platformLabel(platform).slice(0, 2) };
  return (
    <span
      className="platform-logo"
      style={{
        width: size,
        height: size,
        background: brand.bg,
        color: brand.fg,
        fontSize: size * 0.34,
      }}
      aria-hidden
    >
      {brand.mark}
    </span>
  );
}
