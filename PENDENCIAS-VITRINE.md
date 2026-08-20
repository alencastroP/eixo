# Vitrine — o que falta para ir ao ar

Levantamento do que **não** pôde ser preenchido com informação verificada durante a
implementação da vitrine (`/loja/:slug`). Cada item diz onde resolver e o que acontece
enquanto não for resolvido — nada aqui bloqueia a publicação, mas tudo aqui melhora a
página ou a operação.

Referência da loja piloto: **Washington Veículos** (`/loja/washington-veiculos`).

---

## 1. Imagens

| Item | Onde resolver | Situação atual |
| --- | --- | --- |
| **Fotos dos veículos** | CRM → Estoque → editar veículo → galeria | Nenhum dos 7 veículos tem foto. Os cards mostram a hachura com "foto em breve". É o item de maior impacto visual — o site fica pronto no momento em que as fotos entram. |
| **Foto do hero** (vitrine/pátio) | CRM → Vitrine → Destaque inicial → Enviar imagem | Sem imagem, o hero usa a textura diagonal com a legenda "foto — vitrine da loja". Ideal: foto ampla e horizontal (~1600×1000). |
| **Logotipo oficial** | CRM → Vitrine → Identidade → Enviar logo | Está em uso uma **reconstrução vetorial** do emblema (escudo + W) em `frontend/public/logos/washington-veiculos.svg`, desenhada a partir da imagem enviada. Envie o arquivo original (SVG de preferência, ou PNG com fundo transparente) para substituir — o campo aceita upload e não exige mexer em código. |
| **Logotipos das montadoras** | `frontend/src/storefront/brandLogos.tsx` | Os emblemas de Chevrolet, Honda, Toyota, Nissan, VW, Ford, Renault, Fiat, Hyundai, Mitsubishi, Citroën, BMW, Mercedes, Audi e Jeep são **interpretações geométricas próprias**, não os logotipos registrados. Se a loja quiser os oficiais, é preciso obter os arquivos com licença de uso e trocar o `path` de cada marca. Marca sem emblema cai no monograma tipográfico automaticamente. |

## 2. Dados da loja que não constam no site atual

Preencher em **CRM → Vitrine → Contato** (ou Conteúdo):

- **Instagram e Facebook** — os ícones do rodapé só aparecem quando as URLs estão preenchidas.
- **E-mail comercial** — está usando `contato@washingtonveiculos.com.br`, que foi **presumido** a partir do domínio. Confirmar se existe e se é o canal certo.
- **CNPJ / razão social** — não constam no site atual. Necessários para o rodapé, a política de privacidade e a emissão fiscal (CRM → Configurações → Dados da Empresa).
- **Link do Google Maps** — hoje aponta para uma busca pelo endereço (`?query=Rua+das+Acucenas+426...`). Trocar pelo link curto do perfil da loja no Google Meu Negócio dá o pin exato e as avaliações.
- **Política de Privacidade / LGPD** — o site antigo tinha a página; a vitrine ainda não tem. Precisa do texto para publicar (a página em si é rápida de adicionar depois do texto pronto).

## 3. Financiamento

O simulador usa **entrada 20%, 48x, 1,99% a.m.** — números de referência configuráveis em
**CRM → Vitrine → Conteúdo → Simulação de financiamento**. Confirmar com a loja:

- taxa média realmente praticada pelos bancos parceiros;
- prazo máximo oferecido (o texto do hero fala em "financiamento", a simulação vai até 60x);
- quais bancos são parceiros (hoje o texto diz "os principais bancos", genérico).

A tela já avisa que é simulação sujeita à análise de crédito — mas quanto mais perto da
realidade, menos frustração no atendimento.

## 4. Atendimento por IA (botão inferior direito)

Funciona ponta a ponta: a conversa vira um **ticket real** no CRM (plataforma `site`,
campanha `site:<slug>:chat`), o bot responde e o atendente assume quando quiser.

Pendências operacionais:

- **`ANTHROPIC_API_KEY` em produção** — em desenvolvimento a chave existe e a IA respondeu
  nos testes. No Render, a variável está marcada como `sync: false`, ou seja, precisa ser
  preenchida no dashboard. **Sem a chave o botão continua funcionando**: o lead é registrado
  e o visitante recebe "nossa equipe responde pelo WhatsApp em instantes".
- **Revisar o prompt do agente** (`backend/src/modules/aiAgent/prompt.ts`) com as regras da
  loja: o que pode prometer sobre preço, desconto, reserva e agendamento. Hoje o agente é
  conservador e transfere para humano quando não tem certeza — o que é seguro, mas pode ser
  calibrado.
- **Custo por conversa** — cada mensagem é uma chamada ao modelo. O teto atual é de 60
  mensagens por IP/hora (`RATE_LIMIT_SITE_CHAT_PER_HOUR`). Avaliar se o volume real pede
  um modelo mais barato (`ANTHROPIC_MODEL=claude-haiku-4-5`).

## 5. Publicação

- **Domínio.** A vitrine responde em `/loja/washington-veiculos` em qualquer host. Para o
  subdomínio próprio (`washington-veiculos.seudominio.com.br`), falta apontar um DNS curinga
  `*.seudominio.com.br` para o Worker do Cloudflare e somar o curinga ao `CORS_ORIGIN` da API.
- **Domínio atual da loja.** `washingtonveiculos.com.br` está com o site da AutoCerto. A
  migração exige decidir a data de corte e redirecionar o DNS — nada disso é automático.
- **Migration em produção.** Rodar `npx prisma migrate deploy` e, uma vez, `npm run backfill:storefronts`.

## 6. Conteúdo que vale revisar com a loja

Os textos abaixo foram **escritos por nós** a partir do que o site atual comunica, e devem ser
lidos pela loja antes de ir ao ar (CRM → Vitrine → Conteúdo):

- título e subtítulo do hero;
- os 4 diferenciais ("Procedência verificada", "Financiamento aprovado no dia", "Avaliamos seu
  usado", "Revisado antes da entrega") — são promessas comerciais e precisam ser verdadeiras;
- o texto "Quem é a Washington Veículos";
- título e descrição para o Google (SEO).

---

_Atualizado em 18/08/2026, junto com a entrega da vitrine._
