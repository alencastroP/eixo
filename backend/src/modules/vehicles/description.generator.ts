import type { VehicleType } from '@prisma/client';

/**
 * Co-piloto de descrição de anúncio.
 *
 * Gera um texto de venda persuasivo a partir dos dados estruturados do veículo
 * + observações livres do vendedor. Implementação atual: composição por regras
 * (determinística, offline). Para trocar por IA real, substitua o corpo desta
 * função por uma chamada ao Claude (Anthropic SDK) montando o prompt com os
 * mesmos campos — a assinatura e o retorno permanecem iguais.
 */

export interface DescriptionInput {
  type: VehicleType;
  brand: string;
  model: string;
  version?: string | null;
  yearFabrication: number;
  yearModel: number;
  color?: string | null;
  fuel?: string | null;
  km: number;
  optionals: string[];
  extraNotes?: string;
}

const kmText = (km: number) => new Intl.NumberFormat('pt-BR').format(km);

function condition(input: DescriptionInput): string {
  const age = new Date().getFullYear() - input.yearModel;
  if (input.km <= 30000 && age <= 3) return 'seminovo impecável, com pouquíssima rodagem';
  if (input.km <= 60000 && age <= 6) return 'em excelente estado de conservação';
  if (input.km <= 100000) return 'bem cuidado e revisado';
  return 'com manutenção em dia e pronto para rodar';
}

function highlightOptionals(optionals: string[]): string {
  if (optionals.length === 0) return '';
  const top = optionals.slice(0, 6);
  const rest = optionals.length - top.length;
  const list = top.join(', ');
  return rest > 0 ? `${list} e mais ${rest} itens` : list;
}

export function generateVehicleDescription(input: DescriptionInput): string {
  const title = [input.brand, input.model, input.version].filter(Boolean).join(' ');
  const yearLabel = input.yearFabrication === input.yearModel
    ? `${input.yearModel}`
    : `${input.yearFabrication}/${input.yearModel}`;
  const noun = input.type === 'MOTORCYCLE' ? 'moto' : input.type === 'HEAVY' ? 'veículo' : 'carro';

  const parts: string[] = [];

  // abertura
  parts.push(
    `🚗 ${title} ${yearLabel} — um ${noun} ${condition(input)}.`,
  );

  // corpo com specs
  const specs: string[] = [];
  specs.push(`Apenas ${kmText(input.km)} km rodados`);
  if (input.color) specs.push(`na cor ${input.color.toLowerCase()}`);
  if (input.fuel) specs.push(`motorização ${input.fuel.toLowerCase()}`);
  parts.push(`${specs.join(', ')}. Uma ótima oportunidade para quem busca qualidade e procedência.`);

  // opcionais
  const opts = highlightOptionals(input.optionals);
  if (opts) {
    parts.push(`Vem completo com ${opts} — conforto e tecnologia em cada detalhe.`);
  }

  // observações do vendedor, tecidas no texto
  const notes = input.extraNotes?.trim();
  if (notes) {
    parts.push(`Destaques informados pelo vendedor: ${notes}.`);
  }

  // chamada para ação
  parts.push(
    `Aceitamos seu usado na troca e temos as melhores condições de financiamento. ` +
      `Agende agora sua visita ou test-drive e garanta o seu ${title}! 📲`,
  );

  return parts.join('\n\n');
}
