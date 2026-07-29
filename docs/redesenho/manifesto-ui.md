# CHORA+ — Manifesto de UI para redesenho gráfico

Documento de trabalho para produzir propostas visuais numa ferramenta de design
(geração de imagens, Figma, v0, Stitch ou equivalente) e depois aplicá-las ao
código. Descreve **o que cada ecrã é, o que tem de mostrar e o que não pode
perder** — não o aspeto que deve ter. O aspeto é o que se vai buscar fora.

Acompanha este documento a pasta [`capturas/`](capturas/), com 28 imagens do
estado atual (ecrã inteiro, 1440 px de largura, tema claro e escuro).

---

## 1. O que é a aplicação

Sistema de **controlo de execução de contratos públicos de outsourcing de TI**
numa empresa do setor público empresarial português. Cobre exclusivamente a
**fase de execução** — o que acontece depois de o contrato estar assinado:
afetar pessoas, registar e aprovar horas, acompanhar o consumo do valor
contratado, conferir e validar faturas, e decidir a tempo as modificações que o
Código dos Contratos Públicos permite.

Três coisas moldam tudo o que se vê:

1. **Os atos são irreversíveis e auditáveis.** Validar uma fatura, prorrogar uma
   vigência ou substituir uma pessoa num contrato são atos administrativos.
   A interface tem de mostrar o que vai acontecer **antes** de acontecer.
2. **As regras são a autoridade, não a interface.** Há 61 regras de negócio
   (`RN-xxx`) com base legal, que bloqueiam ou condicionam. Elas aparecem
   citadas no ecrã, por código, sempre que condicionam alguma coisa.
3. **O tempo é o recurso escasso.** Quase todas as decisões têm prazo-limite
   calculado para trás a partir de um evento. Uma decisão que perde o prazo
   perde a opção, não a urgência.

**Idioma: português europeu (pós-AO90).** Todo o texto de interface, incluindo
o das propostas visuais.

---

## 2. Quem usa, e como

| Papel | O que faz | Onde vive |
|---|---|---|
| **Gestor de contrato** | Decide. Aprova horas, valida faturas, modifica contratos, orçamenta. | Hoje, Contratos, Faturação, Orçamentação |
| **Gestor técnico** | Aprova horas e acompanha execução; não decide faturação. | Hoje, Registos, Contratos |
| **Elemento da equipa técnica** | Regista as suas horas. Vê pouco mais. | Registos |

**Contexto de utilização:** desktop, num monitor de trabalho, várias vezes ao
dia, muitas vezes com o interlocutor ao lado ou numa reunião. Não é uma
aplicação de consulta ocasional nem uma app móvel — é uma ferramenta de
trabalho onde se está uma hora seguida.

**Largura de referência: 1440 px.** Tem de aguentar 1280 px sem partir e
respirar bem a 1920 px. Não há requisito de telemóvel.

---

## 3. O que o redesenho não pode quebrar

Estas não são preferências — são consequências do domínio.

- **Densidade.** As tabelas têm 6 a 9 colunas e quem as lê quer ver 15 a 20
  linhas sem rolar. Um redesenho que ganhe elegância à custa de metade das
  linhas por ecrã torna a aplicação pior. Ar sim, espaço vazio não.
- **Números alinhados à direita, com algarismos de largura fixa**
  (`font-variant-numeric: tabular-nums`). Colunas de dinheiro e de horas têm de
  comparar-se a olho, na vertical.
- **Moeda em euros com formato pt-PT** (`100 000,00 €` — espaço como separador
  de milhares, vírgula decimal).
- **Os códigos de regra (`RN-612`) e de alerta (`AL-NOVO-PROCEDIMENTO`) são
  visíveis e monoespaçados.** São a prova de que a aplicação não inventou nada.
- **Distinguir a olho três naturezas de informação:** o que é *facto registado*,
  o que é *projeção* e o que é *regra*. Hoje faz-se com etiquetas de
  proveniência coloridas.
- **Tema claro e escuro**, ambos de primeira classe.
- **Nada de imagens, ícones em ficheiro, tipos de letra remotos ou bibliotecas
  de UI.** A aplicação corre como site estático sem servidor; tudo o que se vê
  é CSS, tipos de letra do sistema e caracteres. Ícones desenhados a SVG inline
  são aceitáveis; um pacote de ícones não.

---

## 4. Sistema visual atual (ponto de partida — para substituir ou refinar)

Tudo assenta em **variáveis CSS** (`packages/web/src/estilo.css`, 112 linhas).
Trocar a paleta é trocar estas variáveis.

### Cor — tema claro

| Token | Valor | Uso |
|---|---|---|
| `--marca` | `#0e5b6e` | Cor de ação, separador ativo, botão primário |
| `--marca-2` | `#0a4655` | Fundo da barra lateral |
| `--marca-fraca` | `#e7f0f2` | Fundo de *chips* |
| `--fundo` | `#eef1f2` | Fundo da página |
| `--superficie` | `#ffffff` | Cartões, tabelas, barra de topo |
| `--superficie-2` | `#f7f9fa` | Cabeçalhos de tabela, campos de formulário |
| `--linha` / `--linha-forte` | `#e0e5e7` / `#cfd6d9` | Separadores e contornos |
| `--texto` / `--texto-suave` / `--texto-fraco` | `#132227` / `#5c6b71` / `#8a979c` | Três níveis, sempre |
| `--verde` / `--verde-b` | `#2e7d55` / `#e5f2ea` | Conforme, validado, dentro do previsto |
| `--ambar` / `--ambar-b` | `#b7791f` / `#fbf1de` | Atenção, avisos, prazos a aproximar |
| `--vermelho` / `--vermelho-b` | `#c0392b` / `#fbe7e4` | Bloqueio por regra, prazo vencido |
| `--azul` / `--azul-b` | `#2b6cb0` / `#e6eef7` | Informação, proveniência «Regra» |
| `--ardosia` / `--ardosia-b` | `#697c83` / `#eceff0` | Neutro, estados inativos |

### Cor — tema escuro

`--marca` `#2ba0b8` · `--fundo` `#0d1719` · `--superficie` `#132227` ·
`--texto` `#e6edee`. Os pares de cor semântica mantêm o tom e trocam o fundo
para uma versão escura de baixa saturação.

### Tipografia

Tipo de letra do **sistema** (`system-ui`). Escala em uso:

| Elemento | Tamanho | Peso |
|---|---|---|
| Título de ecrã (h1) | 19 px | 600 |
| Subtítulo de ecrã | 12 px | 400, `--texto-suave` |
| Título de cartão (h3) | 14 px | 600 |
| Corpo / tabela | 13 px | 400 |
| Cabeçalho de tabela | 11 px | 600, versaletes, `letter-spacing: .5px` |
| Secundário em célula | 11.5 px | 400, `--texto-fraco` |
| Valor de KPI | 26 px | 750, `letter-spacing: -.5px` |

### Geometria

Raio `10px` em cartões, `7px` em botões e campos, `20px` em *pills*.
Sombra de cartão: `0 1px 2px rgba(19,34,39,.06), 0 8px 24px rgba(19,34,39,.06)`.
Barra lateral com `236px` de largura fixa. Conteúdo com `20px 22px` de margem.

### Componentes primitivos existentes

`.cartao` (contentor com cabeçalho) · `.btn` / `.btn.pri` / `.btn.sm` /
`.btn.perigo` · `.pill` (estado, com ponto colorido) · `.chip` · `.barra`
(barra de progresso de consumo) · `.kpi` (número grande com rótulo e sublinha) ·
`.seps` / `.sep` (separadores de topo) · `.stepper` / `.passo` (assistente de
passos) · `.dropzone` · `.aviso` / `.erro-cx` / `.ok-cx` (caixas de mensagem) ·
`.campo` (rótulo + controlo) · `.vazio` (estado sem dados) ·
`.confbadge` (confiança de extração OCR: alta/média/baixa).

---

## 5. Mapa de navegação

Barra lateral fixa, escura, com três blocos:

```
CHORA+  (logótipo «C+» num quadrado com gradiente)
Controlo de horas

TRABALHO
  Hoje                    [contador de decisões pendentes]
  Contratos
  Registos e aprovações
  Faturação
ANÁLISE
  Relatórios
⚙ CONFIGURAÇÕES E OUTROS  (gaveta que abre e fecha)
  Regras e alertas
  Orçamentação
  Recursos
  Auditoria
  Acessos
  Dados de demonstração
```

Barra de topo (canto superior direito, fixa): alternador de tema (`◑`),
indicador do conjunto de dados carregado, e seletor de utilizador com iniciais
num círculo.

**Modo embebido:** a aplicação também corre dentro do Azure DevOps
(`?host=ado`), onde a barra lateral desaparece e o anfitrião fornece a
navegação. O redesenho tem de funcionar sem a lateral.

---

## 6. Inventário de ecrãs

> Cada entrada traz o **propósito**, a **estrutura**, o **conteúdo real** (para
> as propostas não virem com texto de preenchimento em inglês) e o que **tem de
> se ler bem**.

---

### 6.1 · Hoje — a fila de decisões `/` · captura `01`, `23`, `24`, `27`

**É o ecrã de entrada e o mais importante da aplicação.** Substitui um painel de
indicadores por uma pergunta única: *o que tenho de decidir hoje, e até quando?*

**Estrutura:** cabeçalho com contagem → lista de **cartões de contrato**
agrupados por família de decisão → linha de contratos sem decisões → decisões
dispensadas (recolhida) → advertência jurídica → **barra «Perguntar» colada ao
fundo do ecrã**, opaca, com linha própria.

**O cartão de decisão** é o objeto central da aplicação. Contém:
- número e objeto do contrato, estado, valor por executar
- uma ou mais **decisões**, cada uma com título, detalhe em prosa, código de
  alerta, **data-limite e dias que faltam** (negativo quando o prazo passou)
- ao expandir: a **escada de opções**, ordenada do menor para o maior atrito
  jurídico, cada uma com viabilidade, prazo próprio e fundamento legal
- botões de ato e «dispensar»

**Grupos (pela ordem):** `Fim de ciclo` · `Cobertura orçamental plurianual` ·
`Tempo × dinheiro` · `Higiene de execução` · `Faturação`.

**Conteúdo real:**
> «Novo procedimento a lançar em tempo útil» · `AL-NOVO-PROCEDIMENTO` ·
> data-limite 2026-09-12 · faltam 53 dias
> «O contrato termina em 2026-12-31 e sobram 99 600,00 € por executar. Ao ritmo
> das últimas seis semanas, o valor não é consumido até ao término.»

**Tem de se ler bem:** a ordenação por urgência; a diferença entre um prazo com
folga e um vencido; e que cada cartão aponta a um ato concreto, não a um aviso.

**Densidade típica:** 12 a 40 cartões no cenário de cobertura; 4 a 6 num cenário
focado. Ver `01` (denso) contra `23` (focado).

---

### 6.2 · Perguntar — o assistente `componente, dentro do Hoje` · capturas `20`, `21`, `22`

Uma caixa de texto que aceita perguntas e ordens em linguagem corrente. **Não é
um chat lateral** — é uma barra colada ao fundo do Hoje que abre cartões de
resposta acima de si.

Quatro tipos de resposta, todos visualmente distintos:

1. **Resposta** — prosa curta + tabela + etiquetas de proveniência
   (`Regra` azul / `Projeção` ardósia / `Modelo` âmbar) + botões de «passo
   seguinte» + botão de Excel.
2. **Esclarecimento** — quando o pedido é ambíguo, uma pergunta com **opções
   clicáveis** em vez de uma recusa.
   > «"outsourcing" corresponde a mais do que um contrato. A qual se refere?»
   > `[C-2026-001 — desenvolvimento aplicacional · Prestador Alfa]`
   > `[C-2026-002 — sustentação e suporte · Prestador Beta]`
3. **Simulação** — antes de qualquer ato: título, lista de **efeitos**, lista de
   **regras avaliadas** com ✓/✗ e código, avisos, e o botão «Confirmar» — que
   **desaparece** quando uma regra bloqueante falha.
4. **UI embebida** — o ecrã de faturação renderizado dentro da conversa, depois
   de o assistente detetar por OCR que os documentos carregados são uma fatura.

**Barra de lista em curso:** quando uma resposta produz uma tabela, aparece por
cima da caixa uma faixa — `[Lista em curso] Folga para um perfil a 40 €/h ·
19 linhas · 11 colunas` — com ações para acrescentar colunas, exportar, guardar
e largar.

**Tem de se ler bem:** que uma simulação **não é** uma confirmação; e a diferença
entre um número que vem de um registo e um que vem de uma projeção.

---

### 6.3 · Contratos — lista `/contratos` · captura `02`

Tabela larga, ordenável, de todos os contratos. Colunas: `Nº / Objeto` ·
`Prestador (NIPC)` · `Vigência` · `Valor atual do contrato` · `Consumo`
(barra de progresso + percentagem) · `Decisões` (contador) · `Estado` (pill).

20 linhas no cenário de cobertura. Linha clicável para o detalhe.
Ação primária no cabeçalho: `+ Novo contrato`.

**Tem de se ler bem:** a barra de consumo, que é o que se procura ao passar os
olhos pela lista.

---

### 6.4 · Contrato — detalhe `/contratos/:id` · capturas `03` a `06`, `26`

Cabeçalho com `C-2026-001 · Prestação de serviços em outsourcing`, resumo de
decisões e estado. Separadores horizontais, **dinâmicos** (só aparecem os que
fazem sentido para a tipologia do contrato):

| Separador | Conteúdo |
|---|---|
| **Ficha** | Identificação, prazos, valores, gestores, exceções; grelha de pares rótulo/valor + cartões de execução física e financeira |
| **Ações** | *Só quando há decisões pendentes* — os mesmos cartões do Hoje, filtrados a este contrato |
| **Afetações** | Perfis contratuais com dotação e preço/hora; pessoas afetas; histórico de substituições e inativações |
| **Entregáveis** | *Só em contratos chave-na-mão* — lista ordenada com valor, percentagem do contrato, data prevista, estado (previsto / entregue / faturado) |
| **Modificações** | Prorrogações, suspensões, trabalhos complementares, revisões de preço — cada uma com data, fundamento legal e efeito no preço e na vigência |

**Tem de se ler bem:** a Ficha é o ecrã com mais densidade de pares
rótulo/valor da aplicação e é onde o desenho atual está mais fraco.

---

### 6.5 · Novo contrato `/contratos/novo` · captura `07`

Formulário longo, de coluna única, com secções: identificação, prestador,
prazos, valores, tipologia — e, conforme a tipologia escolhida, **estrutura de
perfis** (bolsa de horas), **entregáveis** (chave-na-mão) ou **licenças**
(licenciamento). Validação em linha; o botão de gravar só ativa quando o
mínimo está preenchido.

---

### 6.6 · Registos e aprovações `/registos` · captura `08`

Duas caras conforme o papel: **elemento** regista as suas horas (formulário
compacto + lista dos seus registos); **gestor** aprova em lote (tabela com
seleção múltipla, e resultado por item com código de regra quando algum falha).

Estados de registo: `Submetido` · `Aprovado` · `Rejeitado` · `Anulado`.

---

### 6.7 · Faturação `/faturacao` · capturas `09`, `25`

**Agnóstico ao contrato** — não se navega por contrato; o número do contrato é
um campo de registo obrigatório, obtido por OCR ou escrito à mão.

Estrutura em três zonas:
1. **Faixa superior** — faturas a aguardar nota de crédito, com o que falta.
2. **Coluna principal** — formulário de registo em passos: identificação
   (nº fatura, nº contrato, NIF) → período e montantes → carregamento dos PDF
   (fatura e relatório de horas, ou um ficheiro único) → **conferência
   determinística** contra a execução aprovada → decisão.
3. **Coluna lateral** — faturas registadas, com estado e montante.

A conferência produz um **veredito por linha** (confere / não confere) e a
decisão gera um **relatório de evidência** imutável.

**Tem de se ler bem:** o veredito, e a distinção entre montante faturado,
nota de crédito e montante aprovado.

---

### 6.8 · Relatórios `/relatorios` · capturas `10`, `11`

Três secções, cada uma com o seu âmbito declarado e o controlo ao lado do
título:

| Secção | Âmbito | Conteúdo |
|---|---|---|
| **Faturação** | um ano | Faturas validadas linha a linha (data de aprovação, fatura, contrato, tipo, período, faturado, nota de crédito, aprovado, evidência) + faturação aprovada por contrato e mês com disponível corrido |
| **Consumo por perfil** | um contrato | Horas consumidas / previstas, barra de consumo, valor consumido; exportação para Excel |
| **Guardados** | — | Relatórios compostos no assistente, guardados como **receita**: mostram os passos e um botão «Executar», que responde com os números de hoje |

---

### 6.9 · Orçamentação `/orcamentacao` · captura `12`

Preparação do orçamento do ano seguinte, por projeto. Linhas propostas a partir
da carteira atual, classificadas como continuidade / substituição / renovação /
novo, com variação (aumento / manutenção / redução). Repartição plurianual e
**aviso quando um ano futuro excede 500 000 €**, limite acima do qual a portaria
deixa de caber na competência do conselho de administração (`RN-115`).

---

### 6.10 · Regras e alertas `/regras` · capturas `13`, `14`, `15`

Três separadores, todos tabelas longas e pesquisáveis:
**Regras de negócio (61)** — código, regra, área, base legal, efeito, exceção ·
**Alertas (23)** — em 5 famílias, com nota jurídica e janela de decisão ·
**Funções do assistente (33)** — nome, tipo (consulta / ação), descrição,
parâmetros, regras aplicadas, exemplos, papéis autorizados.

É o ecrã de **transparência**: existe para se poder responder «porque é que a
aplicação diz isto?». Tem de parecer um documento de referência, não um painel.

---

### 6.11 · Ecrãs de apoio

| Ecrã | Rota | Captura | Conteúdo |
|---|---|---|---|
| **Recursos** | `/recursos` | `16` | Pessoas do diretório, entidade executante (NIPC), afetações ativas, ativo/inativo |
| **Auditoria** | `/auditoria` | `17` | Trilha de eventos: quando, quem, entidade, operação, resultado |
| **Acessos** | `/acessos` | `18` | Utilizador → papéis aplicacionais |
| **Dados de demonstração** | `/dados` | `19` | Cinco cenários com descrição e conteúdo; carregar substitui tudo |

---

## 7. Estados que o desenho tem de resolver

- **Vazio de raiz** (capturas `27`, `28`) — a aplicação sem dado nenhum, que é
  um modo suportado. Tem de convidar a começar, não parecer avariada.
- **Vazio por filtro** — «Sem faturas validadas em 2026.»
- **A carregar** — hoje é texto simples; é candidato a melhor tratamento.
- **Erro de regra** — caixa vermelha com o código: «A ação não pode ser
  executada: `RN-301` — o teto de 50% do preço inicial está esgotado.»
- **Sem competência** — o botão não aparece, em vez de aparecer e falhar.

---

## 8. Problemas conhecidos do desenho atual

O que se quer que o redesenho resolva. Visível nas capturas.

1. **A barra de topo colide com o conteúdo.** Os controlos flutuam sobre o canto
   superior direito e sobrepõem-se ao botão «← Voltar» e aos cabeçalhos de ecrã.
   Falta uma barra de topo a sério, com lugar próprio.
2. **A gaveta «Configurações e outros» está no fundo da lateral e quebra a
   linha.** A hierarquia entre os itens de trabalho e os de configuração está
   pouco resolvida.
3. **A Ficha do contrato é uma parede de pares rótulo/valor** sem agrupamento
   visual claro.
4. **O contador de decisões na lateral (`74`) esmaga tudo à volta** e não
   distingue urgente de futuro.
5. **Os cartões de decisão são muito uniformes.** Num ecrã com 40 cartões, nada
   distingue à primeira vista o que vence amanhã do que vence em seis meses.
6. **Falta um sistema de ícones.** Hoje há três ou quatro caracteres soltos
   (`⚙`, `◑`, `⌕`, `📎`) sem coerência.
7. **A tabela é sempre a mesma tabela**, com 6 a 9 colunas, em todos os
   contextos — do catálogo de regras à lista de faturas. Podia haver variações
   de densidade.
8. **As caixas de aviso (`.aviso`, âmbar) estão em excesso** e todas com o mesmo
   peso, pelo que se deixam de ler.

---

## 9. O que se pede às propostas

**Formato útil:** PNG ou JPG, largura 1440 px (ou 2880 px a 2×), ecrã inteiro
com barra lateral e barra de topo incluídas. Uma imagem por ecrã.

**Prioridade — pela ordem em que vale a pena receber:**

1. `Hoje` com a fila de decisões (o ecrã que define a aplicação)
2. `Contrato — Ficha` (o mais denso e o mais fraco hoje)
3. `Faturação` (fluxo em passos + coluna lateral)
4. `Perguntar` com resposta, tabela e simulação
5. `Contratos — lista` (o padrão de todas as tabelas)
6. `Relatórios` e `Regras` (variações do padrão de tabela)
7. Tema escuro de qualquer um dos anteriores

**O que ajuda:** propostas de paleta como conjunto de tokens nomeados;
tratamento explícito do cartão de decisão, da tabela densa e do estado (pill);
uma sugestão de família de ícones desenhável em SVG simples.

**O que não ajuda:** texto de preenchimento em inglês; capturas de painéis de
métricas com gráficos circulares (esta aplicação quase não tem gráficos);
propostas que assumam bibliotecas de componentes ou tipos de letra remotos;
desenho móvel.

---

## 10. Restrições de implementação

| | |
|---|---|
| Stack | React 18 + TypeScript estrito + Vite. Sem framework de UI. |
| Estilo | Um ficheiro `estilo.css` com variáveis CSS. Sem Tailwind, sem CSS-in-JS. |
| Ícones | SVG inline ou caracteres. Sem pacotes de ícones. |
| Tipos de letra | Do sistema. Sem Google Fonts nem ficheiros. |
| Distribuição | Site estático (GitHub Pages), sem servidor. Sem pedidos externos. |
| Dados | Tudo no browser (localStorage). |
| Temas | Claro e escuro via `prefers-color-scheme` **e** `data-theme` no elemento raiz. |
| Idioma | Português europeu (pós-AO90) em todo o texto visível. |

Um redesenho aplica-se, na prática, em três camadas: **as variáveis CSS**
(paleta, raios, sombras), **as classes de componente** em `estilo.css`, e a
estrutura JSX de cada ecrã quando o arranjo muda. As duas primeiras cobrem a
maior parte de uma mudança de identidade visual sem tocar em lógica nenhuma.

---

## 11. Prompts prontos a colar

Todos assumem: *aplicação web de gestão, desktop 1440 px, interface em português
europeu, densa e profissional, tipo de letra do sistema, sem imagens*.

**Hoje — fila de decisões**
> Interface web densa para gestão de contratos públicos, ecrã «Hoje». Barra
> lateral escura de 236 px com navegação em dois grupos. Coluna principal com
> uma fila vertical de cartões de decisão agrupados por título de secção. Cada
> cartão: número de contrato, objeto, estado em etiqueta colorida, e dentro dele
> uma ou duas decisões com título, texto explicativo de duas linhas, código de
> alerta monoespaçado, data-limite e contagem de dias restantes destacada.
> Cartões com prazo vencido têm destaque vermelho; os de prazo folgado, neutro.
> No fundo do ecrã, colada, uma barra de pesquisa em linguagem natural. Texto em
> português europeu. Sem gráficos.

**Contrato — Ficha**
> Ecrã de detalhe de um contrato numa aplicação web de gestão. Cabeçalho com
> número e objeto do contrato, etiqueta de estado e resumo de decisões
> pendentes. Separadores horizontais: Ficha, Ações, Afetações, Modificações.
> Conteúdo em grelha de duas colunas com grupos de pares rótulo/valor
> (identificação, prazos, valores, gestores) e dois cartões de execução com
> barras de progresso de consumo e valores em euros alinhados à direita.
> Português europeu, denso, profissional, sem ilustrações.

**Faturação**
> Ecrã de conferência de faturas. Faixa superior de aviso com uma fatura a
> aguardar nota de crédito. Abaixo, duas colunas: à esquerda um formulário em
> passos (número da fatura, número do contrato, NIF, período, montantes, zona de
> carregamento de PDF tracejada) com caixas de nota que citam códigos de regra;
> à direita uma lista compacta de faturas registadas com etiquetas de estado
> coloridas. Português europeu, denso.

**Assistente — resposta com tabela e simulação**
> Cartões de conversa numa aplicação de gestão. Primeiro cartão: pergunta em
> cima, resposta em prosa curta, tabela de sete colunas com números alinhados à
> direita, botões de ação secundária em baixo e etiquetas pequenas de
> proveniência. Segundo cartão: painel de simulação com contorno destacado,
> lista de efeitos, lista de regras avaliadas com marcas de certo e errado e
> códigos monoespaçados, e um botão de confirmação. Português europeu.

**Lista de contratos**
> Tabela larga numa aplicação web de gestão, vinte linhas visíveis. Colunas:
> número e objeto do contrato em duas linhas, prestador com NIPC, vigência,
> valor em euros alinhado à direita, barra de progresso de consumo com
> percentagem, contador de decisões, etiqueta de estado. Cabeçalho de tabela em
> versaletes pequenas. Português europeu, denso, sem ilustrações.

---

## 12. Índice das capturas

| # | Ficheiro | Ecrã |
|---|---|---|
| 01 | `01-hoje-fila.png` | Hoje — fila densa (20 contratos) |
| 02 | `02-contratos-lista.png` | Contratos — lista |
| 03 | `03-contrato-ficha.png` | Contrato — Ficha |
| 04 | `04-contrato-afetacoes.png` | Contrato — Afetações |
| 05 | `05-contrato-modificacoes.png` | Contrato — Modificações |
| 06 | `06-contrato-entregaveis.png` | Contrato — Entregáveis (chave-na-mão) |
| 07 | `07-contrato-novo.png` | Novo contrato |
| 08 | `08-registos-aprovacoes.png` | Registos e aprovações |
| 09 | `09-faturacao.png` | Faturação |
| 10 | `10-relatorios-faturacao.png` | Relatórios — Faturação |
| 11 | `11-relatorios-consumo.png` | Relatórios — Consumo por perfil |
| 12 | `12-orcamentacao.png` | Orçamentação |
| 13 | `13-regras-negocio.png` | Regras — negócio |
| 14 | `14-regras-alertas.png` | Regras — alertas |
| 15 | `15-regras-assistente.png` | Regras — funções do assistente |
| 16 | `16-recursos.png` | Recursos |
| 17 | `17-auditoria.png` | Auditoria |
| 18 | `18-acessos.png` | Acessos |
| 19 | `19-dados-demonstracao.png` | Dados de demonstração |
| 20 | `20-assistente-esclarecimento.png` | Assistente — pergunta de volta |
| 21 | `21-assistente-tabela-composta.png` | Assistente — tabela composta |
| 22 | `22-assistente-simulacao.png` | Assistente — simulação de ato |
| 23 | `23-hoje-cenario-pequeno.png` | Hoje — cenário focado |
| 24 | `24-hoje-escuro.png` | Hoje — tema escuro |
| 25 | `25-faturacao-escuro.png` | Faturação — tema escuro |
| 26 | `26-contrato-escuro.png` | Contrato — tema escuro |
| 27 | `27-vazio-hoje.png` | Hoje — aplicação vazia |
| 28 | `28-vazio-contratos.png` | Contratos — aplicação vazia |

Para recapturar depois de qualquer alteração:

```sh
pnpm --filter @chora/web build
cd packages/web && pnpm exec vite preview --port 4231 --strictPort &
node docs/redesenho/capturar.mjs
```
