/**
 * Emblemas das marcas para a faixa de seleção da vitrine.
 *
 * São interpretações geométricas simplificadas, desenhadas em SVG monocromático
 * (herdam currentColor) — nada de arquivo externo: a vitrine não faz requisição
 * a terceiros e o traço acompanha o tema claro/escuro sem versão dupla.
 * Marca sem emblema conhecido cai no monograma tipográfico.
 *
 * Para usar os logotipos oficiais, substitua o emblema aqui pelo SVG do
 * fabricante (ver PENDENCIAS-VITRINE.md).
 */
import type { SVGProps } from 'react';

type Mark = (p: SVGProps<SVGSVGElement>) => JSX.Element;

const svg = (children: JSX.Element, viewBox = '0 0 24 24'): Mark =>
  function BrandMark(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox={viewBox}
        width="26"
        height="26"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  };

/** Gravata-borboleta. */
const chevrolet = svg(
  <>
    <path d="M1.5 9.5h6.2l1.6-3h5.4l-1.1 3h9.9v5h-6.2l-1.6 3H10l1.1-3H1.5z" strokeLinejoin="round" />
  </>,
);

/** "H" dentro de moldura arredondada. */
const honda = svg(
  <>
    <rect x="2" y="5.5" width="20" height="13" rx="4" />
    <path d="M8.5 8.5v7M15.5 8.5v7M8.5 12h7" strokeLinecap="round" />
  </>,
);

/** Três elipses entrelaçadas. */
const toyota = svg(
  <>
    <ellipse cx="12" cy="12" rx="10.2" ry="6.6" />
    <ellipse cx="12" cy="9.9" rx="3.5" ry="2.4" />
    <ellipse cx="12" cy="12.6" rx="5.6" ry="3.9" transform="rotate(90 12 12.6)" />
  </>,
);

/** Círculo cortado pela barra horizontal. */
const nissan = svg(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M2.8 12h18.4" />
    <path d="M6.5 9.6h11v4.8h-11z" />
  </>,
);

/** V sobre W dentro do círculo. */
const volkswagen = svg(
  <>
    <circle cx="12" cy="12" r="9.4" />
    <path d="M6.2 7.8 12 20.4l5.8-12.6" strokeLinejoin="round" />
    <path d="M9.2 7.8 12 14.2l2.8-6.4" strokeLinejoin="round" />
  </>,
);

/** Oval alongada (assinatura da marca). */
const ford = svg(
  <>
    <ellipse cx="12" cy="12" rx="10.6" ry="6.4" />
    <ellipse cx="12" cy="12" rx="8.8" ry="4.8" strokeWidth={0.9} />
    <path d="M7.4 13.4c.9-2.4 2.6-3.2 4.6-3.2s3.6.9 4.6 2.6" strokeLinecap="round" strokeWidth={1.2} />
  </>,
);

/** Losango. */
const renault = svg(
  <>
    <path d="M12 2.4 18.4 12 12 21.6 5.6 12z" strokeLinejoin="round" />
    <path d="M12 6.6 15.4 12 12 17.4 8.6 12z" strokeLinejoin="round" strokeWidth={1.1} />
  </>,
);

/** Retângulo com barras inclinadas. */
const fiat = svg(
  <>
    <rect x="2.2" y="6" width="19.6" height="12" rx="2.4" />
    <path d="M8.4 9.2 6.6 14.8M12.4 9.2l-1.8 5.6M16.4 9.2l-1.8 5.6" strokeLinecap="round" strokeWidth={1.3} />
  </>,
);

/** Oval inclinada com "H" estilizado. */
const hyundai = svg(
  <>
    <ellipse cx="12" cy="12" rx="10.4" ry="6.6" />
    <path d="M8.4 8.8c-.8 3 -.8 4.4 0 6.4M15.6 8.8c.8 3 .8 4.4 0 6.4M8.4 12h7.2" strokeLinecap="round" strokeWidth={1.3} />
  </>,
);

/** Três diamantes. */
const mitsubishi = svg(
  <>
    <path d="M12 3.4 15.4 9.4H8.6z" strokeLinejoin="round" />
    <path d="M8.2 11.2 11.6 17.2H4.8z" strokeLinejoin="round" />
    <path d="M15.8 11.2 19.2 17.2h-6.8z" strokeLinejoin="round" />
  </>,
);

/** Duplo chevron. */
const citroen = svg(
  <>
    <path d="M5.6 12.4 12 6.4l6.4 6" strokeLinejoin="round" />
    <path d="M5.6 18 12 12l6.4 6" strokeLinejoin="round" />
  </>,
);

/** Roundel quadriculado. */
const bmw = svg(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <circle cx="12" cy="12" r="6.4" strokeWidth={1.1} />
    <path d="M12 5.6v12.8M5.6 12h12.8" strokeWidth={1.1} />
    <path d="M12 5.6A6.4 6.4 0 0 1 18.4 12H12z" fill="currentColor" stroke="none" opacity="0.85" />
    <path d="M12 18.4A6.4 6.4 0 0 1 5.6 12H12z" fill="currentColor" stroke="none" opacity="0.85" />
  </>,
);

/** Estrela de três pontas. */
const mercedes = svg(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M12 12V3.2M12 12 4.4 16.6M12 12l7.6 4.6" strokeLinecap="round" strokeWidth={1.4} />
  </>,
);

/** Quatro anéis. */
const audi = svg(
  <>
    <circle cx="6" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="10" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="14" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="18" cy="12" r="4.2" strokeWidth={1.3} />
  </>,
);

/** Grade de sete fendas com faróis. */
const jeep = svg(
  <>
    <rect x="3.4" y="7.4" width="17.2" height="9.2" rx="1.6" />
    <path d="M7.6 7.4v9.2M10.4 7.4v9.2M13.2 7.4v9.2M16 7.4v9.2" strokeWidth={1.1} />
    <circle cx="5.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </>,
);

const MARKS: Record<string, Mark> = {
  chevrolet,
  gm: chevrolet,
  honda,
  toyota,
  nissan,
  volkswagen,
  vw: volkswagen,
  ford,
  renault,
  fiat,
  hyundai,
  mitsubishi,
  citroen: citroen,
  'citroën': citroen,
  bmw,
  'mercedes-benz': mercedes,
  mercedes,
  audi,
  jeep,
};

const normalize = (brand: string) =>
  brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function hasBrandMark(brand: string): boolean {
  return normalize(brand) in MARKS;
}

/** Emblema da marca, ou null quando não há um desenhado para ela. */
export function BrandLogo({ brand, size = 26 }: { brand: string; size?: number }) {
  const Mark = MARKS[normalize(brand)];
  if (!Mark) return null;
  return <Mark width={size} height={size} />;
}
