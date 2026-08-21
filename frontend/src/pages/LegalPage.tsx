import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { renderMarkdown } from '../utils/markdown';

/**
 * Os 8 documentos públicos de legal/ (contratuais + informativos). Os demais
 * (governança interna, uso operacional) não são para este público - ver
 * legal/00-INDICE.md.
 */
const LEGAL_DOCS: { slug: string; file: string; title: string }[] = [
  { slug: 'termos-de-uso', file: '01-TERMOS-DE-USO.md', title: 'Termos de Uso' },
  { slug: 'privacidade', file: '02-POLITICA-DE-PRIVACIDADE.md', title: 'Política de Privacidade' },
  { slug: 'dpa', file: '03-DPA-ACORDO-DE-TRATAMENTO-DE-DADOS.md', title: 'Acordo de Tratamento de Dados (DPA)' },
  { slug: 'sla', file: '04-SLA-NIVEL-DE-SERVICO.md', title: 'Acordo de Nível de Serviço (SLA)' },
  { slug: 'uso-aceitavel', file: '05-POLITICA-DE-USO-ACEITAVEL.md', title: 'Política de Uso Aceitável' },
  { slug: 'cookies', file: '06-POLITICA-DE-COOKIES.md', title: 'Política de Cookies' },
  { slug: 'transparencia-ia', file: '08-TRANSPARENCIA-INTELIGENCIA-ARTIFICIAL.md', title: 'Transparência de Inteligência Artificial' },
  { slug: 'subprocessadores', file: '14-LISTA-DE-SUBPROCESSADORES.md', title: 'Lista de Subprocessadores' },
];

function LegalChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-doc-page">
      <header className="legal-doc-header">
        <Link to="/" className="legal-doc-brand">
          <BrandMark size={22} />
          <span>Eixo</span>
        </Link>
        <Link to="/" className="legal-doc-back">
          ← Voltar
        </Link>
      </header>
      <main className="legal-doc-main">{children}</main>
    </div>
  );
}

const DRAFT_NOTICE = (
  <div className="legal-doc-notice">
    <strong>Minuta em revisão.</strong> Este documento ainda não passou por revisão jurídica e pode conter campos
    entre colchetes (ex.: <code>[CNPJ]</code>) a preencher quando a empresa for formalizada. Vale como indicação de
    intenção, não como termo em vigor.
  </div>
);

export function LegalIndexPage() {
  return (
    <LegalChrome>
      <h1>Documentos legais</h1>
      <p className="legal-doc-intro">
        Conjunto de documentos que regem o uso da plataforma Eixo e o tratamento de dados pessoais.
      </p>
      {DRAFT_NOTICE}
      <ul className="legal-doc-index">
        {LEGAL_DOCS.map((doc) => (
          <li key={doc.slug}>
            <Link to={`/legal/${doc.slug}`}>{doc.title}</Link>
          </li>
        ))}
      </ul>
    </LegalChrome>
  );
}

export function LegalDocPage() {
  const { slug } = useParams<{ slug: string }>();
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setContent(null);
    setError(false);
    fetch(`/legal/${doc.file}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [doc]);

  if (!doc) {
    return (
      <LegalChrome>
        <h1>Documento não encontrado</h1>
        <p>
          <Link to="/legal">Ver todos os documentos</Link>
        </p>
      </LegalChrome>
    );
  }

  return (
    <LegalChrome>
      <p className="legal-doc-crumb">
        <Link to="/legal">Documentos legais</Link> / {doc.title}
      </p>
      {DRAFT_NOTICE}
      {error && <p className="form-error">Não foi possível carregar este documento agora.</p>}
      {!error && !content && <p className="legal-doc-intro">Carregando…</p>}
      {content && <article className="legal-doc-body">{renderMarkdown(content)}</article>}
    </LegalChrome>
  );
}

export const LEGAL_DOC_LIST = LEGAL_DOCS;
