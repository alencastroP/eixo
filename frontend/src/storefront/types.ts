/** Contratos da vitrine pública — espelham os serializadores de
 *  backend/src/modules/storefront/storefront.service.ts. */

export interface StorefrontBrand {
  name: string;
  tagline: string;
  logoUrl: string | null;
  primary: string;
  theme: 'dark' | 'light';
}

export interface StorefrontHero {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  ctaPrimary: string;
  ctaSecondary: string;
  badges: string[];
}

export interface StorefrontHighlight {
  icon: string;
  title: string;
  text: string;
}

export interface StorefrontContact {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  hours: string;
  mapUrl: string;
  instagram: string;
  facebook: string;
}

export interface StorefrontFinancing {
  downPercent: number;
  months: number;
  monthlyRate: number;
}

export interface StorefrontSections {
  featured: boolean;
  inventory: boolean;
  highlights: boolean;
  financing: boolean;
  sell: boolean;
  about: boolean;
  contact: boolean;
}

export interface StorefrontConfig {
  brand: StorefrontBrand;
  hero: StorefrontHero;
  highlights: StorefrontHighlight[];
  about: { title: string; text: string };
  contact: StorefrontContact;
  financing: StorefrontFinancing;
  sections: StorefrontSections;
  seo: { title: string; description: string };
}

export interface SiteVehicle {
  id: string;
  type: 'CAR' | 'MOTORCYCLE' | 'HEAVY';
  brand: string;
  model: string;
  version: string | null;
  yearFabrication: number;
  yearModel: number;
  km: number;
  color: string | null;
  fuel: string | null;
  price: number | null;
  reserved: boolean;
  featured: boolean;
  coverUrl: string | null;
  photoCount: number;
}

export interface SiteVehicleDetail extends SiteVehicle {
  optionals: string[];
  description: string | null;
  photos: { id: string; url: string }[];
}

export interface SiteFacets {
  brands: { name: string; count: number }[];
  years: number[];
  priceMin: number | null;
  priceMax: number | null;
  total: number;
}

export interface SitePayload {
  slug: string;
  store: StorefrontConfig;
  featured: SiteVehicle[];
  facets: SiteFacets;
}

export type SiteTag = 'automatico' | 'manual' | '4x4';

export interface SiteVehicleQuery {
  search?: string;
  brand?: string;
  tag?: SiteTag;
  year?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: 'recent' | 'priceAsc' | 'priceDesc' | 'kmAsc' | 'yearDesc';
  page?: number;
  pageSize?: number;
}

export interface SiteLeadInput {
  name: string;
  phone: string;
  email?: string;
  message?: string;
  vehicleId?: string;
  origin: 'vehicle' | 'financing' | 'sell' | 'contact';
  website?: string; // honeypot
}

export interface ChatReply {
  token: string;
  reply: string | null;
  aiEnabled: boolean;
  handedOff: boolean;
}

export interface ChatInput {
  token?: string;
  name?: string;
  phone?: string;
  message: string;
  vehicleId?: string;
}
