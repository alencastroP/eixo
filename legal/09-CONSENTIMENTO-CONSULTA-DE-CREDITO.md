# Termo de Consentimento para Consulta de Crédito

**Versão 1.0** · Vigente a partir de `[DATA DE VIGÊNCIA]`

Este documento contém: (a) o **termo a ser apresentado ao titular** antes de qualquer consulta; (b) as **regras de uso** vinculantes para a revenda; (c) a **especificação do registro** do consentimento; e (d) uma **nota de implantação** sobre o estágio atual do módulo.

> ### ⚠️ Nota de implantação - leia antes de habilitar o módulo
>
> Na data desta versão, o módulo de crédito da plataforma **não consulta bureau de crédito real**. O resultado exibido é **gerado internamente para demonstração**.
>
> Enquanto isso for verdade:
>
> 1. A tela **deve** exibir aviso permanente e inequívoco de que o resultado é simulado e **não tem validade para decisão de concessão de crédito**.
> 2. **Não** se deve colher o consentimento da Parte A, porque não há tratamento de consulta a bureau a consentir. Colher consentimento para uma consulta que não ocorre induz o titular a erro.
> 3. O módulo **não pode ser apresentado comercialmente** como consulta de crédito, análise de score ou verificação de restrições. Fazê-lo caracteriza publicidade enganosa (CDC, art. 37).
>
> A Parte A entra em vigor **no momento em que houver bureau contratado**, junto com a alteração da cláusula 12.4 dos Termos de Uso para a alínea (b).

---

# Parte A - Termo apresentado ao titular

*Texto a ser exibido em tela, lido em voz alta ou enviado por mensagem, conforme o canal.*

---

## Autorização para consulta de crédito

**`[RAZÃO SOCIAL DA REVENDA]`**, CNPJ `[CNPJ DA REVENDA]`, solicita sua autorização para consultar informações de crédito em seu nome.

**O que será consultado**
Informações de crédito vinculadas ao seu CPF/CNPJ junto a `[NOME DO BUREAU]`, incluindo indicadores de pontuação de crédito e existência de apontamentos de inadimplência.

**Para quê**
Exclusivamente para **analisar a viabilidade de financiamento ou de venda a prazo** do veículo que estamos negociando com você, agora.

**Quem terá acesso**
Apenas os profissionais desta revenda envolvidos na sua negociação, e as instituições financeiras às quais a proposta for encaminhada, **se você autorizar o encaminhamento**.

**Por quanto tempo guardamos**
O resultado é mantido por até **365 dias** e depois eliminado automaticamente. Você pode pedir a eliminação antes disso.

**O que acontece se você não autorizar**
Você **continua sendo atendido normalmente**. Poderá comprar à vista, negociar entrada e troca, e agendar visita. Apenas não conseguiremos adiantar a análise de financiamento - ela será feita diretamente pelo banco no momento da proposta.

**Seus direitos**
Você pode, a qualquer momento: saber o que foi consultado, pedir cópia do resultado, corrigir dados, **revogar esta autorização** e pedir a eliminação do resultado. Basta falar com a revenda. Revogar não anula consultas já realizadas, mas impede novas.

**Contato para dados pessoais:** `[E-MAIL DA REVENDA]` · `[TELEFONE]`

---

☐ **Eu, `[NOME DO TITULAR]`, CPF `[CPF]`, autorizo** a consulta de informações de crédito em meu nome, para a finalidade descrita acima.

*`[DATA E HORA]` · `[CANAL: presencial / WhatsApp / site]`*

---

# Parte B - Regras de uso pela revenda

## 1. Consentimento

**1.1.** A consulta **só pode ocorrer após** manifestação afirmativa do titular, registrada na plataforma.

**1.2.** O consentimento é **específico**: vale para a negociação em curso. Nova negociação, meses depois, exige nova autorização.

**1.3.** O consentimento é **destacado**: não pode estar embutido em um "aceito os termos" genérico, em ficha cadastral ou em contrato de outra natureza.

**1.4.** O consentimento é **livre**: não pode ser condição para atendimento, visita, test-drive ou proposta à vista. Recusa não autoriza tratamento diferenciado.

**1.5.** O consentimento é **informado**: as informações da Parte A devem ser efetivamente apresentadas, não apenas disponibilizadas em link.

**1.6.** A revogação deve ser **tão simples quanto** o consentimento, e atendida de imediato.

## 2. Finalidade

**2.1.** Somente para **análise de risco em negociação efetivamente em curso**.

**2.2.** É vedado consultar: por curiosidade; para formar cadastro; para prospecção; sobre pessoa que apenas pediu informação; sobre terceiro não envolvido - cônjuge, familiar, avalista não anuente, concorrente.

**2.3.** É vedado usar o resultado para finalidade diversa, inclusive segmentação comercial ou definição de prioridade de atendimento.

## 3. Tratamento do resultado

**3.1.** É **informação confidencial**, restrita a quem participa da negociação.

**3.2.** É vedado imprimir, fotografar, encaminhar por mensagem ou compartilhar fora da plataforma.

**3.3.** Recusa de crédito deve ser comunicada **em reserva, sem constrangimento e sem exposição** perante terceiros. É vedado comentar a situação financeira do cliente em ambiente aberto, na presença de outras pessoas ou em grupo de mensagens.

**3.4.** Solicitado o resultado pelo titular, ele deve ser fornecido.

## 4. Registro

**4.1.** Toda consulta fica registrada com identificação do usuário responsável, data, hora e vínculo com o consentimento.

**4.2.** O registro é auditável e pode ser exigido pelo titular, pela ANPD ou por autoridade judicial.

**4.3.** Consulta sem consentimento registrado é **violação da Política de Uso Aceitável** e autoriza a suspensão do módulo ou da conta.

---

# Parte C - Especificação do registro

> **Status: não implementado.** Hoje não há campo de consentimento no sistema, e a checagem antes da consulta não existe. Esta é a especificação a construir.

## 5. Dados a registrar

Vinculados ao lead:

| Campo | Descrição |
|---|---|
| `consentAt` | Data e hora da manifestação |
| `consentSource` | Canal: `presencial`, `whatsapp`, `site`, `telefone` |
| `consentVersion` | Versão deste termo apresentada |
| `consentCollectedBy` | Usuário que colheu (nulo quando colhido pelo próprio titular) |
| `consentEvidence` | Referência à evidência: identificador da mensagem, do formulário assinado ou do aceite em tela |
| `consentRevokedAt` | Data da revogação, quando houver |

## 6. Regras de comportamento do sistema

**6.1.** A consulta deve ser **bloqueada no servidor** quando não houver consentimento válido e não revogado para o lead. Bloqueio apenas na interface não é controle.

**6.2.** A mesma checagem deve valer para a **ferramenta do agente de inteligência artificial** que dispara consulta. Este é o ponto mais fácil de esquecer e o de maior risco: o agente pode consultar sem que nenhuma pessoa tenha decidido consultar.

**6.3.** A consulta deve ser **vinculada obrigatoriamente a um lead**. Consulta avulsa, sem titular identificado na base, não deve ser permitida - é o caminho pelo qual o módulo vira ferramenta de curiosidade.

**6.4.** O consentimento deve ter **prazo de validade** configurável, sugerido em **90 dias**, após o qual nova consulta exige nova autorização.

**6.5.** A revogação deve **bloquear novas consultas de imediato**, preservando o histórico das anteriores.

**6.6.** O registro do consentimento **não é alcançado** pela rotina de expurgo enquanto houver consulta associada dentro do prazo de retenção.

## 7. Pendência de isolamento entre contas

> ⚠️ **Bloqueador.** Na data desta versão, a tabela de consultas de crédito **não possui vínculo com a conta contratante**, ao contrário das demais tabelas de dados de negócio. Na prática, consultas realizadas por uma revenda não estão isoladas das demais.
>
> Isso é incompatível com:
> - a cláusula 4.5 do Acordo de Tratamento de Dados (isolamento lógico entre contas);
> - o item II.2 do Anexo II do mesmo Acordo;
> - a seção 7 da Política de Privacidade.
>
> **Este ponto deve ser corrigido antes da assinatura do primeiro contrato**, sob pena de os documentos afirmarem garantia que o sistema não entrega. A correção é a mesma já aplicada às demais tabelas: vínculo com a conta, preenchimento dos registros existentes e filtro obrigatório em toda leitura.

---

# Parte D - Textos de interface

## 8.1. Antes da consulta, na plataforma

> **Consulta de crédito**
> Antes de consultar, confirme que o cliente autorizou.
>
> ☐ O cliente **`[NOME]`** foi informado sobre a finalidade da consulta e **autorizou** expressamente.
> Canal da autorização: `( ) Presencial  ( ) WhatsApp  ( ) Site  ( ) Telefone`
>
> A consulta fica registrada em seu nome, com data e hora. Consultar sem autorização viola a Política de Uso Aceitável e a LGPD.
>
> `[ Cancelar ]` `[ Consultar ]`

## 8.2. Solicitação de autorização por mensagem

> Oi, `[NOME]`! Para adiantar a análise do financiamento, preciso da sua autorização para consultar seu CPF junto a `[BUREAU]`.
>
> É usado **só** para verificar a viabilidade do financiamento deste veículo, fica guardado por até 365 dias e você pode cancelar quando quiser.
>
> Se preferir não autorizar, seguimos normalmente - só não conseguimos adiantar essa parte.
>
> Responde **SIM** para autorizar. Detalhes aqui: `[LINK]`

## 8.3. Aviso permanente enquanto o resultado for simulado

> ⚠️ **Resultado simulado - sem consulta a bureau de crédito.**
> Os valores nesta tela são gerados para demonstração e **não têm validade para decisão de crédito**. Não os apresente ao cliente como análise real.

## 8.4. Ao exibir resultado real

> Resultado obtido em `[BUREAU]` em `[DATA]`, mediante autorização registrada de `[NOME]`.
> Informação confidencial - restrita a esta negociação. A decisão de conceder crédito é da instituição financeira.

---

_`[RAZÃO SOCIAL]` · CNPJ `[CNPJ]` · Versão 1.0_
