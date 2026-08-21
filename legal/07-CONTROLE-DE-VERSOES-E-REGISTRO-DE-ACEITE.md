# Controle de Versões e Registro de Aceite - Eixo

**Documento interno de governança** · **Versão 1.0** · `[DATA]`

Um termo aceito sem prova de aceite vale pouco em disputa. Este documento define **como os documentos jurídicos do Eixo são versionados, publicados, aceitos e provados**, e especifica o registro técnico que sustenta essa prova.

Destinatários: responsável jurídico, responsável de produto e desenvolvimento.

---

## 1. Por que isto existe

Três situações que ocorrem na prática e que só um controle de versão resolve:

1. **Cliente contesta uma cláusula.** Você precisa provar *qual texto* ele aceitou, *quando* e *por qual meio* - não o texto que está no ar hoje.
2. **Você muda os termos.** Precisa saber quem já aceitou a nova versão e quem ainda opera sob a anterior, porque as duas produzem efeitos diferentes.
3. **Fiscalização ou requisição de titular.** Você precisa demonstrar a base legal vigente à época do tratamento.

---

## 2. Documentos sob controle

| Código | Documento | Exige aceite? | Onde é aceito |
|---|---|---|---|
| `terms` | Termos de Uso e Contrato de Licença | **Sim** | Cadastro, contratação e re-aceite |
| `privacy` | Política de Privacidade | Ciência (não é contrato) | Link no cadastro e no rodapé |
| `dpa` | Acordo de Tratamento de Dados | **Sim** (integra os Termos) | Junto com `terms` |
| `subprocessors` | Lista de Subprocessadores | Não - comunicação prévia | Publicação + e-mail |
| `sla` | Acordo de Nível de Serviço | **Sim** (integra os Termos) | Junto com `terms` |
| `aup` | Política de Uso Aceitável | **Sim** (integra os Termos) | Junto com `terms` |
| `cookies` | Política de Cookies | Consentimento apenas se houver categoria não essencial | Banner |
| `credit-consent` | Termo de Consentimento para Consulta de Crédito | **Sim, pelo titular** | Antes de cada consulta |

---

## 3. Regra de versionamento

**3.1. Formato:** `MAJOR.MINOR` - por exemplo, `1.0`, `1.1`, `2.0`.

| Tipo | Quando | Efeito |
|---|---|---|
| **MAJOR** (`1.x` → `2.0`) | Alteração **material**: restringe direito do Cliente, amplia obrigação, altera preço fora do reajuste, muda finalidade de tratamento, inclui categoria de dado, altera limitação de responsabilidade ou foro | **Comunicação com 30 dias de antecedência + novo aceite obrigatório** |
| **MINOR** (`1.0` → `1.1`) | Correção de redação, esclarecimento sem mudança de efeito, atualização de dado cadastral, ajuste de formatação | Publicação com registro no histórico; **sem novo aceite** |

**3.2.** Na dúvida entre MAJOR e MINOR, **trate como MAJOR**. O custo de um re-aceite desnecessário é baixo; o de uma cláusula inoponível é alto.

**3.3.** Toda versão tem **data de vigência futura**, nunca retroativa.

**3.4.** Versões anteriores **nunca são apagadas ou editadas**. Ficam publicadas em histórico permanente, acessível por URL estável - por exemplo, `/legal/termos/v1.0`.

**3.5.** O arquivo de cada versão é preservado com **hash de conteúdo** (SHA-256) registrado, para provar que o texto exibido ao Cliente é o mesmo que está arquivado.

---

## 4. Procedimento de alteração material

| Etapa | Prazo | Responsável |
|---|---|---|
| 1. Redação e revisão jurídica da nova versão | - | Jurídico |
| 2. Publicação da nova versão com data de vigência futura | D-30 | Produto |
| 3. Comunicação por e-mail a todos os clientes ativos | D-30 | Produto |
| 4. Aviso persistente na plataforma | D-30 até o aceite | Produto |
| 5. Entrada em vigor | D-0 | - |
| 6. Bloqueio suave para quem não aceitou | D-0 | Produto |
| 7. Registro dos aceites e relatório de cobertura | contínuo | Produto |

**4.1. Bloqueio suave.** A partir da vigência, o usuário que não aceitou vê uma tela de aceite ao entrar. Ele pode ler o documento, ver o que mudou, aceitar - ou **cancelar sem ônus**, conforme a cláusula 21.3 dos Termos. Não se deve interromper o acesso a dados nem impedir a exportação.

**4.2. Resumo do que mudou.** Toda alteração material é acompanhada de um resumo em linguagem simples ("o que mudou nesta versão"), exibido junto ao documento. Isso não substitui o texto integral, mas é o que a maioria vai ler - e é o que sustenta a boa-fé.

---

## 5. Registro do aceite - especificação técnica

> **Status: não implementado.** Hoje não existe registro de aceite no sistema. Esta seção é a especificação a construir.

### 5.1. Dados a registrar

Cada aceite gera **um registro imutável** com:

| Campo | Descrição | Por quê |
|---|---|---|
| `id` | Identificador do registro | - |
| `accountId` | Conta que aceitou | Vincula ao contrato |
| `userId` | Usuário que praticou o ato | Identifica quem manifestou a vontade |
| `documentCode` | `terms`, `dpa`, `aup`, `sla`, `credit-consent` | Qual documento |
| `documentVersion` | `1.0`, `2.0` | **Qual texto** foi aceito |
| `documentHash` | SHA-256 do arquivo publicado | Prova de integridade do texto |
| `acceptedAt` | Data e hora com fuso | Quando |
| `ip` | Endereço IP de origem | Elemento de autoria |
| `userAgent` | Navegador e sistema | Elemento de autoria |
| `context` | `signup`, `checkout`, `reacceptance`, `plan-change` | Em que momento |

### 5.2. Regras de integridade

- O registro é **somente de inserção**. Nunca é atualizado nem excluído - um novo aceite gera uma nova linha.
- Sobrevive ao encerramento da conta, pelo prazo de prescrição aplicável, por ser prova de relação contratual (Termos, cláusula 20.4, alínea "c").
- Não é alcançado pela rotina de expurgo de retenção.
- A ausência de registro de aceite da versão vigente é o gatilho do bloqueio suave da seção 4.1.

### 5.3. Onde o aceite é colhido

| Momento | Documentos |
|---|---|
| Cadastro do teste gratuito | `terms`, `dpa`, `aup`, `sla` (bloco único) |
| Contratação de plano pago | `terms` da versão vigente + autorização de cobrança recorrente |
| Re-aceite por nova versão material | O documento alterado |
| Antes de cada consulta de crédito | `credit-consent`, registrado no lead |

### 5.4. Exigências de interface

- A caixa de seleção **nunca vem pré-marcada**. Consentimento pré-marcado não é manifestação livre.
- Os links abrem o **texto integral**, sem exigir download.
- O aceite dos documentos contratuais é **um ato**, com um checkbox listando os documentos - não quatro caixas separadas, que aumentam abandono sem ganho jurídico.
- A **Política de Privacidade não recebe checkbox**: ela é informativa, não contratual. Colher "aceite" de política de privacidade sugere, erroneamente, que o tratamento se baseia em consentimento.
- O botão de envio do formulário fica **desabilitado** até a marcação.

---

## 6. Textos de interface

### 6.1. Cadastro do teste gratuito

> ☐ Li e aceito os **[Termos de Uso](#)**, o **[Acordo de Tratamento de Dados](#)**, a **[Política de Uso Aceitável](#)** e o **[Acordo de Nível de Serviço](#)**.
>
> Tratamos seus dados conforme a **[Política de Privacidade](#)**. Usamos seu CPF apenas para garantir um teste gratuito por pessoa - ele é armazenado de forma irreversível e não é usado para nenhuma outra finalidade.

*Botão:* `Começar teste de 15 dias`

### 6.2. Contratação de plano pago

> ☐ Li e aceito os **[Termos de Uso](#)** e documentos anexos, e **autorizo a cobrança recorrente** de `R$ [VALOR]` por `[ciclo]` no meio de pagamento informado, até que eu solicite o cancelamento.
>
> A renovação é automática. Você pode cancelar a qualquer momento pela própria plataforma, com efeito ao fim do período já pago.

*Botão:* `Confirmar assinatura`

### 6.3. Re-aceite por nova versão

> **Atualizamos nossos Termos de Uso**
>
> A versão `[X.Y]` entra em vigor em `[DATA]`. Principais mudanças:
>
> - `[mudança 1, em linguagem simples]`
> - `[mudança 2]`
>
> [Ler o texto completo](#) · [Comparar com a versão anterior](#)
>
> ☐ Li e aceito a nova versão dos Termos de Uso e documentos anexos.
>
> Se preferir não aceitar, você pode **cancelar sem custo** até `[DATA]`, com devolução proporcional do período não usufruído, e exportar seus dados a qualquer momento.

*Botões:* `Aceitar e continuar` · `Ver opções de cancelamento`

### 6.4. Comunicação de novo subprocessador

> **Assunto:** Alteração na nossa lista de prestadores - vigência em `[DATA]`
>
> Olá, `[NOME]`.
>
> A partir de `[DATA]`, passaremos a utilizar **`[NOME DO SUBPROCESSADOR]`** para `[FINALIDADE]`, com processamento em `[LOCALIZAÇÃO]`.
>
> A lista completa e atualizada está em `[URL]`.
>
> Se você tiver objeção fundamentada, responda a este e-mail em até 15 dias. Não havendo solução consensual, você pode rescindir sem multa, conforme a cláusula 6.4 do Acordo de Tratamento de Dados.

---

## 7. Registro de versões publicadas

Tabela a manter atualizada a cada publicação.

| Documento | Versão | Vigência | Tipo | Resumo da alteração | Hash (SHA-256) |
|---|---|---|---|---|---|
| Termos de Uso | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| Política de Privacidade | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| DPA | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| SLA | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| Política de Uso Aceitável | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| Política de Cookies | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| Lista de Subprocessadores | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |
| Consentimento de Crédito | 1.0 | `[DATA]` | Inicial | Primeira versão | `[HASH]` |

Para gerar o hash de cada arquivo:

```bash
sha256sum legal/*.md
```

---

## 8. Responsabilidades

| Papel | Responsabilidade |
|---|---|
| **Jurídico** | Redigir e revisar; classificar a alteração como MAJOR ou MINOR |
| **Produto** | Publicar, comunicar, implementar o bloqueio suave, manter o histórico |
| **Desenvolvimento** | Manter o registro de aceite íntegro; garantir que o expurgo não o alcance |
| **Encarregado (DPO)** | Verificar coerência entre o que os documentos dizem e o que o sistema faz |

**8.1.** A verificação do item do DPO é a mais importante e a mais esquecida: documento que promete o que o sistema não faz é risco maior do que documento inexistente, porque constitui prova contra quem o publicou.

---

_Documento interno · `[RAZÃO SOCIAL]` · Versão 1.0_
