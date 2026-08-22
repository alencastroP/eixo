/**
 * Emblemas das marcas para a faixa de seleção da vitrine.
 *
 * SVG monocromático (herdam currentColor) - nada de arquivo externo: a vitrine
 * não faz requisição a terceiros, sem fundo e o traço acompanha o tema
 * claro/escuro sem versão dupla. Cada marca define seu próprio viewBox; o
 * componente renderiza todas na mesma altura (prop `size`), preservando a
 * proporção natural de cada logotipo - mesmo tratamento usado em tiras de
 * "marcas atendidas" de sites reais, onde a altura é constante e a largura
 * varia. Marca sem emblema conhecido cai no monograma tipográfico.
 *
 * Nissan e Renault usam o vetor oficial (fornecido pela loja). As demais são
 * reconstruções à mão a partir da referência visual do logotipo - fiéis à
 * silhueta, mas não o arquivo vetorial registrado da montadora. Se a loja
 * enviar o arquivo oficial de alguma marca, é só trocar o `d` do path aqui.
 */
import type { SVGProps } from 'react';

type Mark = (p: { height?: number } & SVGProps<SVGSVGElement>) => JSX.Element;

const ratioOf = (viewBox: string) => {
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  return w / h;
};

function shapeMark(children: JSX.Element, viewBox: string, base: SVGProps<SVGSVGElement>): Mark {
  const ratio = ratioOf(viewBox);
  return function BrandMark({ height = 26, ...props }: { height?: number } & SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox={viewBox} height={height} width={height * ratio} aria-hidden="true" {...base} {...props}>
        {children}
      </svg>
    );
  };
}

/** Traço monocromático (para logos "de linha": roundels, elipses, chevrons). */
const outlineMark = (children: JSX.Element, viewBox = '0 0 24 24'): Mark =>
  shapeMark(children, viewBox, { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 });

/** Forma sólida (para logos de silhueta cheia: gravatas, diamantes, letras). */
const solidMark = (children: JSX.Element, viewBox = '0 0 24 24'): Mark =>
  shapeMark(children, viewBox, { fill: 'currentColor', stroke: 'none' });

/** Logotipo puramente tipográfico (a marca não tem emblema separado do nome). */
const wordmark = (
  text: string,
  opts: { weight?: number; italic?: boolean; family?: string; charWidth?: number } = {},
): Mark => {
  const { weight = 800, italic = false, family = 'Arial, Helvetica, sans-serif', charWidth = 12.5 } = opts;
  const width = Math.round(text.length * charWidth + 8);
  const viewBox = `0 0 ${width} 24`;
  return shapeMark(
    <text
      x={width / 2}
      y={17.4}
      textAnchor="middle"
      textLength={width - 6}
      lengthAdjust="spacingAndGlyphs"
      fontFamily={family}
      fontWeight={weight}
      fontStyle={italic ? 'italic' : 'normal'}
      fontSize={17}
    >
      {text}
    </text>,
    viewBox,
    { fill: 'currentColor', stroke: 'none' },
  );
};

/** Gravata-borboleta. */
const chevrolet = solidMark(
  <path d="M1.3 9.6h6.3l1.7-3.2h5.6l-1.2 3.2h10v4.9h-6.4l-1.7 3.2h-5.6l1.2-3.2H1.3z" />,
);

/** "H" dentro de moldura arredondada. */
const honda = outlineMark(
  <>
    <rect x="2" y="5.5" width="20" height="13" rx="4" />
    <path d="M8.5 8.5v7M15.5 8.5v7M8.5 12h7" strokeLinecap="round" />
  </>,
);

/** Três elipses entrelaçadas. */
const toyota = outlineMark(
  <>
    <ellipse cx="12" cy="12" rx="10.2" ry="6.6" />
    <ellipse cx="12" cy="9.9" rx="3.5" ry="2.4" />
    <ellipse cx="12" cy="12.6" rx="5.6" ry="3.9" transform="rotate(90 12 12.6)" />
  </>,
);

/** V sobre W dentro do círculo. */
const volkswagen = outlineMark(
  <>
    <circle cx="12" cy="12" r="9.4" />
    <path d="M6.2 7.8 12 20.4l5.8-12.6" strokeLinejoin="round" />
    <path d="M9.2 7.8 12 14.2l2.8-6.4" strokeLinejoin="round" />
  </>,
);

/** Oval alongada com a assinatura ("Ford") estilizada como traço contínuo. */
const ford = outlineMark(
  <>
    <ellipse cx="12" cy="12" rx="10.6" ry="6.4" />
    <ellipse cx="12" cy="12" rx="8.8" ry="4.8" strokeWidth={0.9} />
    <path d="M7.4 13.4c.9-2.4 2.6-3.2 4.6-3.2s3.6.9 4.6 2.6" strokeLinecap="round" strokeWidth={1.2} />
  </>,
);

/** FIAT é, na realidade, um logotipo puramente tipográfico. */
const fiat = wordmark('FIAT', { weight: 900, family: "'Arial Black', Arial, sans-serif", charWidth: 15 });

/** Oval inclinada com "H" estilizado. */
const hyundai = outlineMark(
  <>
    <ellipse cx="12" cy="12" rx="10.4" ry="6.6" />
    <path d="M8.4 8.8c-.8 3 -.8 4.4 0 6.4M15.6 8.8c.8 3 .8 4.4 0 6.4M8.4 12h7.2" strokeLinecap="round" strokeWidth={1.3} />
  </>,
);

/** Três diamantes, convergindo no centro em simetria de 120°. */
const mitsubishi = solidMark(
  <>
    <path d="M12 12 9.6 8.5 12 5 14.4 8.5z" />
    <path d="M12 12 9.6 8.5 12 5 14.4 8.5z" transform="rotate(120 12 12)" />
    <path d="M12 12 9.6 8.5 12 5 14.4 8.5z" transform="rotate(240 12 12)" />
  </>,
);

/** Duplo chevron. */
const citroen = outlineMark(
  <>
    <path d="M5.6 12.4 12 6.4l6.4 6" strokeLinejoin="round" />
    <path d="M5.6 18 12 12l6.4 6" strokeLinejoin="round" />
  </>,
);

/** Roundel quadriculado. */
const bmw = outlineMark(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <circle cx="12" cy="12" r="6.4" strokeWidth={1.1} />
    <path d="M12 5.6v12.8M5.6 12h12.8" strokeWidth={1.1} />
    <path d="M12 5.6A6.4 6.4 0 0 1 18.4 12H12z" fill="currentColor" stroke="none" opacity="0.85" />
    <path d="M12 18.4A6.4 6.4 0 0 1 5.6 12H12z" fill="currentColor" stroke="none" opacity="0.85" />
  </>,
);

/** Estrela de três pontas. */
const mercedes = outlineMark(
  <>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M12 12V3.2M12 12 4.4 16.6M12 12l7.6 4.6" strokeLinecap="round" strokeWidth={1.4} />
  </>,
);

/** Quatro anéis. */
const audi = outlineMark(
  <>
    <circle cx="6" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="10" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="14" cy="12" r="4.2" strokeWidth={1.3} />
    <circle cx="18" cy="12" r="4.2" strokeWidth={1.3} />
  </>,
);

/** Jeep também é um logotipo tipográfico (sem emblema separado). */
const jeep = wordmark('Jeep', {
  weight: 800,
  family: "'Segoe UI', 'Arial Rounded MT Bold', Arial, sans-serif",
  charWidth: 13,
});

/** Escudo com emblema central estilizado (abstração - não é o leão oficial). */
const peugeot = outlineMark(
  <>
    <path d="M12 2.6 18.4 4.8v7.4c0 5.2-2.9 8.6-6.4 10-3.5-1.4-6.4-4.8-6.4-10V4.8z" strokeLinejoin="round" />
    <path
      d="M12 9 13.4 11.6 16 13 13.4 14.4 12 17 10.6 14.4 8 13 10.6 11.6z"
      fill="currentColor"
      stroke="none"
    />
  </>,
);

/** "S" sólido. */
const suzuki = solidMark(
  <path d="M7.4 8.1c0-1.9 2-3.1 4.6-3.1 2.2 0 4 .9 4.9 2.2l-2.2 1.4c-.5-.7-1.5-1.2-2.7-1.2-1.1 0-1.9.4-1.9 1.1 0 .8 1 1.1 2.6 1.4 2.6.5 4.8 1.3 4.8 3.8 0 2-2.1 3.2-4.8 3.2-2.3 0-4.3-.9-5.2-2.3l2.2-1.4c.5.8 1.6 1.3 3 1.3 1.1 0 2-.4 2-1.1 0-.8-1-1.1-2.7-1.4-2.5-.5-4.6-1.3-4.6-3.9z" />
);

/** Três cápsulas verticais sugerindo o arco do emblema atual. */
const chery = solidMark(
  <>
    <path d="M8 10.4c1.3 0 2.3 1 2.3 2.3v4.6c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3v-4.6c0-1.3 1-2.3 2.3-2.3z" />
    <path d="M12 4.6c1.4 0 2.5 1.1 2.5 2.5v9.8c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5V7.1c0-1.4 1.1-2.5 2.5-2.5z" />
    <path d="M16 10.4c1.3 0 2.3 1 2.3 2.3v4.6c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3v-4.6c0-1.3 1-2.3 2.3-2.3z" />
  </>,
);

/** BYD é um logotipo tipográfico. */
const byd = wordmark('BYD', { weight: 800, charWidth: 14 });

/**
 * Nissan - vetor oficial (2020), fornecido pela loja: anel partido com o
 * lettering "NISSAN" no vão central. ViewBox e transforms mantidos como no
 * arquivo original para preservar as proporções exatas.
 */
const nissan = solidMark(
  <g transform="translate(170.24 5.0558)">
    <g transform="matrix(.52497 0 0 .52497 -170.24 -5.0558)">
      <path d="m293.7 227.7c-.4.1-2 .1-2.7.1h-51.6v12h52.5c.4 0 3.5 0 4.1-.1 10.7-1 15.6-9.9 15.6-17.7 0-8-5.1-16.6-14.8-17.5-1.9-.2-3.5-.2-4.2-.2h-34.3c-1.5 0-3.2-.1-3.8-.3-2.7-.7-3.7-3.1-3.7-5.1 0-1.8 1-4.2 3.8-5 .8-.2 1.7-.3 3.6-.3h49.5v-11.8h-50.3c-2.1 0-3.7.1-5 .3-8.6 1.2-14.6 8.1-14.6 16.9 0 7.2 4.5 15.6 14.4 17 1.8.2 4.3.2 5.4.2h33.4c.6 0 2.1 0 2.4.1 3.8.5 5.1 3.3 5.1 5.8 0 2.4-1.5 5-4.8 5.6z" />
      <path d="m195.9 227.7c-.4.1-2 .1-2.6.1h-51.7v12h52.5c.4 0 3.5 0 4.1-.1 10.7-1 15.6-9.9 15.6-17.7 0-8-5.1-16.6-14.8-17.5-1.9-.2-3.5-.2-4.2-.2h-34.3c-1.5 0-3.2-.1-3.8-.3-2.7-.7-3.7-3.1-3.7-5.1 0-1.8 1-4.2 3.8-5 .8-.2 1.7-.3 3.6-.3h49.5v-11.8h-50.3c-2.1 0-3.7.1-5 .3-8.6 1.2-14.6 8.1-14.6 16.9 0 7.2 4.5 15.6 14.4 17 1.8.2 4.3.2 5.4.2h33.4c.6 0 2.1 0 2.4.1 3.8.5 5.1 3.3 5.1 5.8 0 2.4-1.4 5-4.8 5.6z" />
      <rect x="101.7" y="181.4" width="13" height="58.7" />
      <polygon points="73 240.1 73 181.4 60 181.4 60 225.2 16.7 181.4 0 181.4 0 240.1 13 240.1 13 196.1 56.6 240.1" />
      <polygon points="491.1 181.4 491.1 225.2 447.8 181.4 431.1 181.4 431.1 240.1 444.1 240.1 444.1 196.1 487.6 240.1 504 240.1 504 181.4" />
      <path d="m363.4 181.4-36.6 58.7h15.8l6.5-10.5h42.7l6.5 10.5h15.7l-36.6-58.7zm21.7 37.1h-29.3l14.7-23.6z" />
      <path d="m72.3 148.1c26.2-76.5 98.4-127.9 179.8-127.9s153.7 51.4 179.8 127.9l.2.6h57.3v-6.9l-23.8-2.8c-14.7-1.7-17.8-8.2-21.8-16.4l-1-2c-34.4-73.2-109.3-120.6-190.7-120.6-81.5 0-156.3 47.4-190.7 120.8l-1 2c-4 8.2-7.1 14.7-21.8 16.4l-23.8 2.8v6.9h57.2z" />
      <path d="m432.1 272.9-.2.6c-26.2 76.5-98.4 127.8-179.8 127.8s-153.7-51.4-179.8-127.9l-.2-.6h-57.2v6.9l23.8 2.8c14.7 1.7 17.8 8.2 21.8 16.4l1 2c34.4 73.4 109.3 120.8 190.7 120.8s156.3-47.4 190.7-120.7l1-2c4-8.2 7.1-14.7 21.8-16.4l23.8-2.8v-6.9z" />
    </g>
  </g>,
  '0 0 264.58 221.38',
);

/**
 * Renault - vetor oficial (losango 2021 + lettering), fornecido pela loja.
 */
const renault = solidMark(
  <>
    <path d="m 208.9847,0 -83.7801,156.00918 83.7801,156.00793 h 23.1817 L 316.8576,156.00918 262.8999,55.53194 250.7151,78.22095 292.4896,156.00918 220.4372,290.17711 148.3861,156.00918 232.1664,0 Z m 48.0051,0 -84.6924,156.00918 53.9591,100.47714 12.1845,-22.68908 -41.7744,-77.78806 72.0524,-134.16799 72.0512,134.16799 -83.7814,156.00793 h 23.1826 L 363.9517,156.00918 280.1714,0 Z" />
    <path
      fillRule="evenodd"
      d="m 79.9942,374.10754 v 62.23127 h 54.2125 V 423.79185 H 96.1104 V 411.1899 h 33.3725 V 398.80857 H 96.1104 v -12.31994 h 37.3091 v -12.38109 z"
    />
    <path
      fillRule="evenodd"
      d="m 0,374.10754 v 62.23127 h 16.1162 v -19.49003 h 19.4006 l 11.2528,19.49003 h 18.5865 l -13.496,-22.89223 c 6.5534,-3.61768 11.2722,-10.20709 11.2722,-18.31429 0,-16.64605 -12.6179,-21.02475 -22.8701,-21.02475 z m 16.1162,12.38109 h 22.8561 c 2.9512,0 6.2357,2.29429 6.2357,9.38713 0,2.40483 -0.702,8.59169 -6.2357,8.59169 H 16.1162 Z"
    />
    <path d="m 148.8468,374.10754 v 62.23127 h 16.1162 v -40.08544 l 35.6286,40.08544 h 16.116 v -62.23127 h -16.116 v 39.7587 l -35.6286,-39.7587 z" />
    <path d="m 253.3119,374.10754 -27.4231,62.23127 h 18.4797 l 4.1814,-10.59523 h 31.3448 l 4.1814,10.59523 h 18.4797 l -27.4231,-62.23127 z m 10.9103,11.92151 10.7866,27.33332 h -21.5729 z" />
    <path d="m 391.7109,374.10754 v 62.23127 H 443.34 v -12.54696 h -35.5131 v -49.68431 z" />
    <path d="m 435.4432,374.10754 v 12.38109 h 24.2204 v 49.85018 h 16.1161 V 386.48863 H 500 v -12.38109 z" />
    <path d="m 310.1242,374.10754 v 42.05703 c 0,17.62353 17.8765,21.35867 32.0531,21.35867 14.1766,0 32.0533,-3.73514 32.0533,-21.35867 v -42.05703 h -16.1162 v 41.26999 c 0,6.40728 -9.6883,8.55893 -15.9371,8.55893 -6.2488,0 -15.937,-2.15165 -15.937,-8.55893 v -41.26999 z" />
  </>,
  '0 0 500 437.52325',
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
  citroen,
  'citroën': citroen,
  bmw,
  'mercedes-benz': mercedes,
  mercedes,
  audi,
  jeep,
  peugeot,
  suzuki,
  chery,
  byd,
};

const normalize = (brand: string) =>
  brand
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

export function hasBrandMark(brand: string): boolean {
  return normalize(brand) in MARKS;
}

/** Emblema da marca, ou null quando não há um desenhado para ela. */
export function BrandLogo({ brand, size = 26 }: { brand: string; size?: number }) {
  const Mark = MARKS[normalize(brand)];
  if (!Mark) return null;
  return <Mark height={size} />;
}
