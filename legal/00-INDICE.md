# Documentos jurídicos - Eixo

Conjunto redigido para a comercialização da plataforma. Todos na **versão 1.0**, em estado de **minuta**.

> **Antes de publicar:** estes documentos são minutas técnicas, redigidas a partir do que o sistema efetivamente faz. Devem passar por **revisão de advogado de tecnologia e proteção de dados** antes de entrar em vigor. O valor deles está em chegar ao advogado com a realidade técnica já mapeada - o que reduz o trabalho dele e o custo para você.

---

## Índice

### Documentos públicos - contratuais

| # | Documento | Papel | Aceite |
|---|---|---|---|
| 01 | [Termos de Uso e Contrato de Licença](01-TERMOS-DE-USO.md) | Contrato principal de adesão | **Sim** |
| 03 | [Acordo de Tratamento de Dados (DPA)](03-DPA-ACORDO-DE-TRATAMENTO-DE-DADOS.md) | Eixo como Operador; anexos de dados e segurança | **Sim** |
| 04 | [Acordo de Nível de Serviço (SLA)](04-SLA-NIVEL-DE-SERVICO.md) | Disponibilidade, suporte, compensação | **Sim** |
| 05 | [Política de Uso Aceitável](05-POLITICA-DE-USO-ACEITAVEL.md) | O que não pode ser feito com a plataforma | **Sim** |

### Documentos públicos - informativos

| # | Documento | Papel |
|---|---|---|
| 02 | [Política de Privacidade](02-POLITICA-DE-PRIVACIDADE.md) | Eixo como Controlador |
| 06 | [Política de Cookies](06-POLITICA-DE-COOKIES.md) | Armazenamento no navegador + modelo de banner |
| 08 | [Transparência de Inteligência Artificial](08-TRANSPARENCIA-INTELIGENCIA-ARTIFICIAL.md) | Aviso público, regras ao cliente, textos de interface |
| 14 | [Lista de Subprocessadores](14-LISTA-DE-SUBPROCESSADORES.md) | Terceiros que tratam dados |

### Documentos de uso operacional

| # | Documento | Papel |
|---|---|---|
| 09 | [Consentimento para Consulta de Crédito](09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md) | Termo ao titular + regras + especificação técnica |
| 10 | [Modelo de Privacidade da Vitrine](10-MODELO-PRIVACIDADE-VITRINE-LOJISTA.md) | Entregue ao lojista para publicar no site dele |

### Documentos internos de governança

| # | Documento | Papel |
|---|---|---|
| 07 | [Controle de Versões e Registro de Aceite](07-CONTROLE-DE-VERSOES-E-REGISTRO-DE-ACEITE.md) | Versionamento, re-aceite, textos de click-wrap |
| 11 | [Designação do Encarregado e Canal do Titular](11-DESIGNACAO-ENCARREGADO-E-CANAL-DO-TITULAR.md) | Ato de designação + fluxo de atendimento |
| 12 | [ROPA - Registro de Operações](12-ROPA-REGISTRO-DE-OPERACOES-DE-TRATAMENTO.md) | Inventário completo dos tratamentos (art. 37) |
| 13 | [Plano de Resposta a Incidentes](13-PLANO-DE-RESPOSTA-A-INCIDENTES.md) | Papéis, prazos, comunicações |

---

## 🔴 Bloqueadores - corrigir antes do primeiro contrato assinado

Estes quatro pontos fazem os documentos afirmarem o que o sistema **não** faz. Documento que promete o que o sistema não entrega é pior que documento inexistente: vira prova contra quem publicou.

| # | Problema | Contradiz | Correção |
|---|---|---|---|
| 1 | **`credit_queries` sem vínculo com a conta** - consultas de crédito (CPF + score) não são isoladas entre revendas | DPA cl. 4.5 e Anexo II.2; Privacidade §7 | Adicionar `accountId`, preencher os registros existentes, filtrar em toda leitura |
| 2 | **Consulta de crédito sem registro de consentimento nem bloqueio no servidor** - inclusive pela ferramenta do agente de IA | Termos cl. 12.2; AUP §4; doc. 09 | Campos `consentAt`/`consentSource`/`consentVersion` no lead + checagem no serviço |
| 3 | **Resultado de crédito é simulado e não há aviso em tela** | Termos cl. 12.4; CDC art. 37 | Aviso permanente na tela, ou desativar o módulo até haver bureau |
| 4 | **Registro de aceite dos termos inexistente** | Termos cl. 22.5; doc. 07 §5 | Modelo `TermsAcceptance` somente-inserção, fora da rotina de expurgo |

Detalhamento em [12-ROPA](12-ROPA-REGISTRO-DE-OPERACOES-DE-TRATAMENTO.md), Parte IV.

---

## Campos preenchidos

A Eixo é operada, neste estágio, por **pessoa física, sem CNPJ** - não por sociedade empresária. Os 14 documentos foram ajustados de acordo: onde antes se pedia razão social/CNPJ/representante legal do prestador, consta agora a identificação da pessoa física responsável. Isso vale apenas para a identidade da **Eixo** como CONTRATADA/Operadora/Encarregada - os campos que identificam o **Cliente** (revenda) continuam aceitando CPF ou CNPJ, conforme o caso dele.

### Identificação do prestador (pessoa física)

| Campo | Valor |
|---|---|
| Nome completo | Pedro Vitor Alencastro de Oliveira |
| CPF | 711.892.774-09 |
| Endereço | Rua Três Barras, 2966, Potengi, Natal/RN, CEP 59110-450 |
| Site | eixocrm.com |
| Comarca/UF (foro de eleição) | Natal/RN |

**Consequência na cláusula 5.6 dos Termos de Uso:** sem CNPJ, a cobrança não gera nota fiscal eletrônica de serviço - gera **recibo de prestação de serviço**. A cláusula foi reescrita nesse sentido. Vale a pena confirmar com um contador a forma correta de recolher tributos (carnê-leão, retenção pelo tomador PJ, etc.) e se/quando compensa abrir MEI.

### Canais de contato

Por ora, um único e-mail pessoal cobre todos os canais (contato, privacidade/encarregado, suporte, segurança, abuso): `pedrovalencastro@outlook.com`. WhatsApp/telefone: `(84) 99903-3248`. Convém separar por subdomínio (`contato@`, `privacidade@` etc.) quando o volume justificar.

### Encarregado (DPO)

Pedro Vitor Alencastro de Oliveira acumula, nesta fase, a função de Encarregado - ver o ato de autodesignação no doc. 11.

### Datas e vigências

Todos os documentos entraram em vigor em **22 de agosto de 2026**.

### Decisões operacionais a tomar

Cada `[N]` e `[A DEFINIR]` é uma decisão pendente, não um preenchimento mecânico:

| Campo | Decisão | Onde |
|---|---|---|
| Retenção de backup | Quantos dias de rotação | Termos 20.3; DPA 10.2; SLA 6.3 |
| `[PERIODICIDADE]` do backup | Diário? Contínuo? | SLA 6.3; DPA II.7 |
| **RPO / RTO** | Perda máxima aceitável e tempo de restabelecimento | SLA 6.3; DPA II.7 |
| Retenção da cópia cifrada do CPF do trial | Hoje indefinida - **pendência de LGPD** | Privacidade §3; ROPA 1.3 |
| Validade do token de renovação | Dias | Cookies 3.1 |
| Retenção de tickets de suporte | Meses | ROPA 1.6 |
| Horário de atendimento `[HH:MM]` | Início e fim | SLA 5.1 |
| `[A DEFINIR]` meio de pagamento | Ver plano de ação, seção 1 | Subprocessadores 3.1 |
| `[A DEFINIR]` provedor de e-mail | | Subprocessadores 3.2 |
| `[NOME DO BUREAU]` | Enquanto vazio, o módulo é demonstrativo | Termos 12.4; doc. 09 |
| Região do Neon | Confirmar; preferir Brasil se disponível | Subprocessadores 1.2 |

### URLs de publicação

`[URL DA AUP]` · `[URL DO DPA]` · `[URL DA LISTA]` · `[URL DA POLÍTICA DE COOKIES]` · `[URL DO HISTÓRICO]` · `[URL DA PÁGINA DE STATUS]`

Sugestão de estrutura, compatível com o versionamento do doc. 07:

```
/legal/termos            → versão vigente
/legal/termos/v1.0       → versão arquivada, permanente
/legal/privacidade
/legal/dpa
/legal/sla
/legal/uso-aceitavel
/legal/cookies
/legal/subprocessadores
/legal/ia
/legal/historico
/status
```

---

## Ordem de execução sugerida

**1. ~~Preencher~~ identificação, contatos e encarregado** - feito, como pessoa física (ver seção acima).

**2. Decidir** os itens operacionais da tabela acima. Backup, RPO e RTO exigem verificar o que a infraestrutura atual realmente entrega antes de prometer.

**3. Revisão jurídica** dos 14 documentos, com atenção a: limitação de responsabilidade (Termos §19), repartição de papéis controlador/operador (DPA §1), cláusula de crédito (Termos §12), e reajuste (Termos §6.4).

**4. Corrigir os 4 bloqueadores** no código.

**5. Implementar o registro de aceite** conforme doc. 07 §5, com os textos de interface do §6.

**6. Publicar** em URLs estáveis, gerar os hashes e preencher a tabela de versões do doc. 07 §7:

```bash
sha256sum legal/*.md
```

**7. Designar formalmente** o Encarregado (doc. 11, Parte A) e publicar o canal.

**8. Verificar coerência** documento × sistema - a atribuição 5 do Encarregado, doc. 11 Parte B. É a última checagem antes de vender.

---

## Manutenção

| Quando | O quê |
|---|---|
| Nova funcionalidade que colete dado novo | Atualizar ROPA e Política de Privacidade |
| Novo terceiro contratado | Atualizar Lista de Subprocessadores + comunicar com 30 dias |
| Mudança material em qualquer documento | Seguir o procedimento do doc. 07 §4 - exige re-aceite |
| Trimestral | Revisar ROPA; conferir coerência documento × sistema |
| Anual | Revisar todos os documentos; revisar prazos de retenção |
| Após incidente S1 ou S2 | Revisar o Plano de Resposta a Incidentes |

---

_Minutas em versão 1.0 · 22 de agosto de 2026 · Pendente de revisão jurídica_
