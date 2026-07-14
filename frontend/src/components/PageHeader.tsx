import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from './icons';

interface PageHeaderProps {
  /** Ícone do módulo, exibido em um chip colorido (omitido quando `back` está presente). */
  icon?: ReactNode;
  /** Rótulo curto acima do título (ex.: "Estoque"). */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controles à direita (botões, filtros de período, etc.). */
  actions?: ReactNode;
  /** Link de volta — substitui o ícone por uma seta de navegação. */
  back?: { to: string; label?: string };
}

/** Cabeçalho padrão das telas internas: ícone/volta + título + subtítulo + ações, com divisor. */
export function PageHeader({ icon, eyebrow, title, subtitle, actions, back }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {back && (
          <Link to={back.to} className="icon-btn page-header-back" title={back.label ?? 'Voltar'}>
            <ChevronLeftIcon size={18} />
          </Link>
        )}
        {!back && icon && <span className="page-header-icon">{icon}</span>}
        <div className="page-header-text">
          {eyebrow && <span className="page-header-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
