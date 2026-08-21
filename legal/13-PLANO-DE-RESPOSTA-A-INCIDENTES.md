# Plano de Resposta a Incidentes de Segurança

**Documento interno** · **Versão 1.0** · `[DATA]`
**Fundamento:** art. 48 da Lei nº 13.709/2018; cláusula 8 do DPA
**Revisão:** anual, e após todo incidente de severidade alta ou crítica

---

## Por que este documento existe

Um incidente de segurança acontece sob pressão, fora do horário comercial, com informação incompleta. As decisões que precisam ser tomadas - se comunica, para quem, em quanto tempo, o que dizer - **não podem ser tomadas pela primeira vez naquele momento**.

Este plano existe para que, no dia, ninguém precise inventar o procedimento.

**Regra de ouro:** contenha primeiro, comunique cedo, preserve evidências sempre. Uma comunicação inicial incompleta e honesta é melhor que uma comunicação tardia e completa.

---

## 1. O que é um incidente

**Incidente de segurança** é qualquer evento, confirmado ou suspeito, que comprometa a **confidencialidade, integridade ou disponibilidade** de dados pessoais ou dos sistemas que os tratam.

### 1.1. Exemplos

| Categoria | Exemplos |
|---|---|
| **Acesso indevido** | Credencial comprometida; acesso a dados de outra conta; falha de autorização explorada |
| **Vazamento** | Exposição pública de dados; envio de dados ao destinatário errado; repositório ou backup exposto |
| **Perda de integridade** | Alteração ou exclusão não autorizada; corrupção de banco de dados |
| **Indisponibilidade** | Perda de dados sem backup recuperável; ataque de negação de serviço prolongado |
| **Código malicioso** | Comprometimento de dependência; injeção de código |
| **Terceiro** | Incidente em subprocessador que afete dados sob nossa responsabilidade |
| **Físico ou humano** | Perda de dispositivo com acesso; erro operacional com exposição de dados |

### 1.2. O que **não** é incidente comunicável, por si só

- Tentativas de acesso bloqueadas pelos controles - login barrado por limitação de tentativas, requisição rejeitada
- Varredura automatizada sem sucesso
- Indisponibilidade sem comprometimento de dados
- Falha funcional sem exposição

Registrar sim; comunicar não. **Na dúvida, escale.** O custo de escalar sem necessidade é uma reunião; o de não escalar é uma sanção.

---

## 2. Papéis

| Papel | Quem | Responsabilidade |
|---|---|---|
| **Coordenador do incidente** | `[NOME]` | Decide, coordena, autoriza comunicações. Única voz de decisão |
| **Responsável técnico** | `[NOME]` | Contém, investiga, corrige, preserva evidências |
| **Encarregado (DPO)** | `[NOME]` | Avalia risco aos titulares; conduz comunicação à ANPD e aos titulares |
| **Comunicação com clientes** | `[NOME]` | Notifica clientes afetados; mantém a página de status |

**Numa equipe pequena, a mesma pessoa acumula papéis** - isso é aceitável, desde que os papéis estejam nomeados e as etapas sejam cumpridas. O que não é aceitável é ninguém saber quem decide.

### 2.1. Contatos

| Contato | Dado |
|---|---|
| Coordenador | `[TELEFONE]` · `[E-MAIL]` |
| Responsável técnico | `[TELEFONE]` · `[E-MAIL]` |
| Encarregado | `[TELEFONE]` · `[E-MAIL]` |
| Advogado | `[NOME]` · `[TELEFONE]` |
| Provedor de hospedagem | `[CANAL DE SUPORTE]` |
| Canal de segurança (externo) | `[E-MAIL DE SEGURANÇA]` |

> Manter esta tabela **também fora do sistema** - impressa ou em dispositivo pessoal. Incidente que derruba o acesso à infraestrutura pode derrubar o acesso à lista de contatos.

---

## 3. Severidade

| Nível | Critério | Exemplo |
|---|---|---|
| **S1 - Crítico** | Vazamento confirmado de dados pessoais em volume relevante; comprometimento de credenciais administrativas; acesso cruzado entre contas | Dump do banco exposto; falha de isolamento explorada |
| **S2 - Alto** | Acesso indevido limitado e confirmado; exposição de dado sensível de poucos titulares; comprometimento de conta de cliente | Credencial de uma revenda usada por terceiro |
| **S3 - Médio** | Suspeita não confirmada de acesso indevido; exposição sem evidência de acesso por terceiro | Registro exposto sem indício de acesso externo |
| **S4 - Baixo** | Evento sem impacto sobre dados pessoais | Tentativas bloqueadas; erro de configuração corrigido antes da exposição |

---

## 4. Fluxo de resposta

### Etapa 0 - Detecção e acionamento — **imediato**

**Fontes:** alertas de monitoramento, relato de cliente, comunicação de pesquisador de segurança, aviso de subprocessador, observação da equipe.

**Ações:**
1. Quem detectar aciona o **Coordenador** por telefone. Não por e-mail, não por mensagem assíncrona.
2. Abrir o **registro do incidente** com data, hora e o que se sabe.
3. Atribuir severidade preliminar - será revista.

> **Não apague nada. Não reinicie servidores sem necessidade de contenção.** Logs, sessões e estado de memória são as evidências que permitem saber o que foi acessado. Perdidos eles, a comunicação à ANPD passa a ser "não sabemos", que é a pior resposta possível.

### Etapa 1 - Contenção — **até 1 hora (S1/S2)**

Objetivo: **parar o dano em curso**, ainda sem entender a causa.

| Ação | Quando |
|---|---|
| Revogar tokens e sessões ativas | Suspeita de credencial comprometida |
| Desabilitar conta ou usuário comprometido | Acesso indevido identificado |
| Rotacionar segredos - chaves de assinatura, de criptografia, credenciais de integração | Suspeita de exposição de segredo |
| Bloquear origem do acesso | Origem identificada |
| Remover conteúdo exposto | Exposição pública |
| Desativar funcionalidade afetada | Falha explorável sem correção imediata |
| Isolar cópia forense do estado atual | **Sempre em S1/S2, antes de alterar** |

### Etapa 2 - Avaliação — **até 24 horas**

Responder, com o que se souber:

1. **O que aconteceu?** Vetor, janela temporal, sistemas envolvidos.
2. **Quais dados?** Categorias, se há dado sensível, se há CPF, se há dado de crédito.
3. **Quantos titulares?** Número exato ou estimativa fundamentada.
4. **De quais clientes?** Quais contas contratantes foram afetadas.
5. **Foi acessado ou apenas exposto?** Há evidência de acesso por terceiro?
6. **Ainda está em curso?**
7. **Qual o risco concreto ao titular?** Fraude, discriminação, dano à imagem, dano financeiro.

> A pergunta 7 é a que determina a obrigação de comunicar. **Risco relevante** existe quando o incidente pode afetar direitos do titular de forma significativa - o que é presumido quando envolve CPF, dado financeiro, dado de crédito ou volume expressivo de dados de contato.

### Etapa 3 - Comunicação aos clientes — **até 48 horas** (cláusula 8.1 do DPA)

**Quem comunica:** responsável por comunicação com clientes, com texto aprovado pelo Coordenador e pelo Encarregado.

**Prazo:** até **48 horas** do conhecimento inequívoco - **mesmo que a investigação não tenha terminado**. Comunicação inicial parcial é o esperado; complementações vêm depois.

**Conteúdo mínimo:** natureza do incidente; categorias de dados e de titulares afetados; volume estimado; medidas de contenção já adotadas; riscos identificados; medidas em curso; contato para informações.

> **Nunca comunique publicamente antes de comunicar os clientes afetados.** O cliente descobrir por rede social o incidente que atingiu os dados dele destrói a relação de forma irrecuperável.

### Etapa 4 - Comunicação à ANPD e aos titulares

**A regra depende do papel:**

| Situação | Quem comunica à ANPD e aos titulares |
|---|---|
| Dados sob **controle do Eixo** - usuários, contratantes, cadastro de teste | **O Eixo** |
| Dados sob **controle de uma revenda** - leads, conversas, crédito | **A revenda**, na condição de Controladora. O Eixo presta todo o auxílio técnico e informacional |

**Prazo:** a LGPD exige comunicação em **prazo razoável**. A orientação da ANPD aponta para **3 dias úteis** contados do conhecimento. **Trate 3 dias úteis como o prazo, e confirme com o advogado a regra vigente na data do incidente.**

**Conteúdo (art. 48, §1º):** descrição da natureza dos dados afetados; informações sobre os titulares envolvidos; medidas técnicas e de segurança utilizadas; riscos relacionados; motivos da demora, se a comunicação não for imediata; medidas adotadas para reverter ou mitigar os efeitos.

**Comunicação aos titulares** deve ser feita em linguagem simples e direta, informando o que aconteceu, quais dados foram afetados, que riscos existem, **o que a pessoa deve fazer** e onde obter informações.

### Etapa 5 - Erradicação e recuperação

1. Corrigir a causa - não apenas o sintoma
2. Validar que a correção resolve, com teste que reproduza o vetor
3. Restaurar dados a partir de backup, se aplicável, **validando integridade**
4. Rotacionar todos os segredos que possam ter sido expostos
5. Restabelecer o serviço
6. **Monitorar por 30 dias** - reincidência pelo mesmo vetor é comum
7. Atualizar a página de status

### Etapa 6 - Relato posterior — **até 5 dias úteis do restabelecimento**

Para incidentes S1 e S2, documentar:

- Linha do tempo: detecção, contenção, correção, comunicação
- Causa raiz - **técnica e organizacional**
- Impacto: dados, titulares, clientes, tempo de indisponibilidade
- O que funcionou na resposta
- O que falhou
- Ações preventivas, com responsável e prazo
- Comunicações realizadas

**Relato sem culpados.** O objetivo é a causa e a prevenção. Post-mortem que procura culpado ensina a equipe a esconder incidente - o oposto do que se quer.

Para S1, publicar versão pública na página de status.

---

## 5. Prazos consolidados

| Etapa | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| Acionar coordenador | Imediato | 1 h | 4 h | 1 dia útil |
| Contenção inicial | 1 h | 4 h | 1 dia útil | Conforme o caso |
| Avaliação de impacto | 24 h | 48 h | 5 dias úteis | - |
| Comunicação aos clientes | **48 h** | **48 h** | Se confirmado | Não |
| Comunicação à ANPD e titulares | **3 dias úteis** | Conforme risco | Conforme risco | Não |
| Relato posterior | 5 dias úteis | 5 dias úteis | Opcional | Não |

---

## 6. Registro do incidente

Manter para cada incidente, inclusive os não comunicáveis - o art. 37 e o princípio da responsabilização exigem demonstrar que houve tratamento adequado:

| Campo | |
|---|---|
| Identificador e severidade | |
| Data e hora da ocorrência, da detecção e do conhecimento inequívoco | |
| Como foi detectado | |
| Descrição e vetor | |
| Dados e titulares afetados | |
| Clientes afetados | |
| Houve acesso por terceiro? | |
| Contenção aplicada | |
| Causa raiz | |
| Comunicações: a quem, quando, por qual meio | |
| Correção e prevenção | |
| Encerramento | |

**A data do "conhecimento inequívoco" é o campo mais importante** - dela correm todos os prazos legais, e é a primeira coisa que a ANPD pergunta.

---

## 7. Modelos de comunicação

### 7.1. Aos clientes - comunicação inicial

> **Assunto: Comunicado de incidente de segurança - ação recomendada**
>
> Prezado(a) `[NOME]`,
>
> Comunicamos um incidente de segurança identificado em `[DATA E HORA]` que **pode ter afetado dados tratados na sua conta**.
>
> **O que aconteceu:** `[descrição objetiva, sem jargão]`
>
> **Dados possivelmente afetados:** `[categorias]`
>
> **Titulares possivelmente afetados:** `[número ou estimativa]`
>
> **O que já fizemos:** `[contenção adotada]`
>
> **O que estamos fazendo:** `[investigação em curso]`
>
> **O que recomendamos que você faça:** `[ações concretas]`
>
> **Sua responsabilidade como Controladora:** conforme o Acordo de Tratamento de Dados, a comunicação à ANPD e aos titulares afetados cabe a você. Estamos à disposição para fornecer todas as informações técnicas necessárias.
>
> Manteremos você informado. Novidades relevantes serão comunicadas por este mesmo canal e em `[URL DA PÁGINA DE STATUS]`.
>
> Contato direto: `[E-MAIL]` · `[TELEFONE]`
>
> `[NOME]` · `[CARGO]`

### 7.2. Ao titular - dados sob controle do Eixo

> **Assunto: Comunicado importante sobre seus dados pessoais**
>
> Olá, `[NOME]`.
>
> Precisamos informar que, em `[DATA]`, identificamos um incidente de segurança que **afetou dados pessoais seus**.
>
> **O que aconteceu:** `[explicação simples]`
>
> **Seus dados afetados:** `[lista específica]`
>
> **Riscos:** `[riscos concretos - por exemplo, tentativas de golpe usando seus dados]`
>
> **O que recomendamos:**
> - `[ação 1 - por exemplo: troque sua senha]`
> - `[ação 2 - por exemplo: desconfie de contatos que citem esses dados]`
>
> **O que já fizemos:** `[medidas]`
>
> Lamentamos o ocorrido. Se tiver dúvidas, escreva para `[E-MAIL DO ENCARREGADO]`.
>
> Você também pode contatar a Autoridade Nacional de Proteção de Dados (ANPD).
>
> `[NOME DO ENCARREGADO]` · Encarregado pelo Tratamento de Dados Pessoais

### 7.3. Página de status

> **`[DATA, HORA]` - Investigando**
> Identificamos `[descrição]`. Estamos investigando e atualizaremos em até `[X]` minutos.
>
> **`[DATA, HORA]` - Identificado**
> Causa identificada: `[descrição]`. Correção em andamento.
>
> **`[DATA, HORA]` - Monitorando**
> Correção aplicada. Monitorando a estabilidade.
>
> **`[DATA, HORA]` - Resolvido**
> Serviço normalizado. Relato completo em até 5 dias úteis.

---

## 8. Preparação - o que precisa existir **antes**

Nenhum plano funciona sem estes itens. Marque o que já existe.

- [ ] **Backup testado** - restauração efetivamente executada ao menos uma vez, com tempo medido
- [ ] **Monitoramento com alerta** que chegue ao celular de alguém fora do horário comercial
- [ ] **Registros de auditoria** suficientes para reconstruir o que foi acessado
- [ ] **Procedimento de rotação de segredos** documentado e testado
- [ ] **Inventário de segredos** - o que existe, onde está, quem tem acesso
- [ ] **Página de status** publicada
- [ ] **Lista de contatos** acessível fora do sistema
- [ ] **Advogado** identificado e ciente de que pode ser acionado com urgência
- [ ] **Canal de segurança externo** publicado, para divulgação responsável
- [ ] **Contatos de emergência dos clientes** cadastrados
- [ ] **Simulação anual** deste plano

> Os três primeiros itens são pré-requisitos absolutos. Sem backup testado, sem alerta e sem trilha de auditoria, a resposta a um incidente sério se resume a descobrir que ele aconteceu e não conseguir dizer o que foi afetado.

---

## 9. Incidente em subprocessador

Comunicado incidente por um subprocessador:

1. Registrar como incidente próprio, com a mesma severidade
2. Avaliar quais dados sob nossa responsabilidade foram afetados
3. Cobrar do subprocessador as informações do art. 48, §1º
4. **Comunicar os clientes afetados nos mesmos prazos** - a responsabilidade perante eles é nossa, conforme a cláusula 6.5 do DPA
5. Avaliar a permanência do subprocessador
6. Registrar no relato posterior

---

## 10. Revisão

Este plano é revisado **anualmente** e **após todo incidente S1 ou S2**. A revisão verifica: contatos atualizados, prazos ainda adequados, itens da seção 8 cumpridos, e lições incorporadas.

**Última revisão:** `[DATA]` · **Próxima:** `[DATA]`

---

_Documento interno · `[RAZÃO SOCIAL]` · Versão 1.0_
