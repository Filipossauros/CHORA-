# Revisão do CCP de 2026 — impacto no catálogo de regras

**Data da verificação:** 2026-10-09.
**Diploma:** Decreto-Lei n.º 177/2026, de 4 de setembro (DR n.º 172/2026, Série I).
**Entrada em vigor:** 1 de outubro de 2026 — há oito dias.

## Aviso sobre as fontes

**Não foi possível ler o texto oficial.** A política de rede do ambiente onde
esta verificação correu bloqueia `diariodarepublica.pt`, `pgdlisboa.pt` e os PDF
das associações setoriais. Tudo o que segue vem de sínteses secundárias
(sociedades de advogados, associações do setor, Boletim da Ordem dos Advogados),
obtidas por pesquisa.

**Consequência prática:** estas conclusões bastam para decidir *que* regras têm
de ser revistas, e não bastam para decidir *qual a nova redação*. Nenhum valor
numérico do catálogo deve ser alterado sem confronto com o Código republicado.

## O que é o diploma

A 17.ª alteração ao CCP e a maior desde a transposição das diretivas de 2014,
feita em 2017. Pelas sínteses: 154 artigos alterados, 34 aditados, 8 revogados,
e republicação integral do Código.

## O que nos atinge diretamente

### 1. O regime da modificação do contrato aplica-se JÁ aos contratos em execução

Esta é a conclusão que importa. A regra geral do diploma é que o novo Código se
aplica aos procedimentos iniciados a partir de 1 de outubro de 2026 — o que
deixaria o CHORA+ em paz por uns anos. **Mas duas matérias são excecionadas e
aplicam-se de imediato aos contratos que estejam em execução a 1 de outubro de
2026:** a modificação objetiva do contrato e a resolução alternativa de litígios.

A modificação objetiva é exatamente o terreno do CHORA+: prorrogações,
suspensões, trabalhos e serviços complementares, o separador «Modificações».
Não é uma alteração para contratos futuros — é uma alteração para a carteira
atual.

### 2. Os artigos 311.º a 315.º foram reescritos

- O artigo 312.º passa a enumerar cinco permissões de modificação, cada uma com
  pressupostos próprios.
- A **alteração anormal e imprevisível das circunstâncias** sai da modificação
  objetiva e passa a ter regime autónomo nos artigos **314.º-A e 314.º-B**.
- Há números revogados no artigo 313.º.

### 3. Surge um limite de 10 % que o catálogo não conhece

Nas modificações de reduzido valor, o valor da alteração tem de ser
**simultaneamente** inferior ao limiar europeu aplicável **e** a 10 % do preço
contratual inicial (15 % nas empreitadas). Não existe regra nenhuma no catálogo
sobre isto.

### 4. O limite de 50 % dos complementares muda de sede e ganha condição

- Os n.ºs 2 a 5 do artigo **370.º** foram revogados; os trabalhos, serviços ou
  bens complementares passam a estar ligados ao artigo **312.º n.º 1 al. c)**.
- O limite de **50 % do preço contratual inicial mantém-se**, mas com uma
  condição cumulativa: só vale **se a mudança de cocontratante não for viável**.
- A acumulação passa a contar-se apenas nas modificações sucessivas da alínea c)
  (artigo 312.º n.º 4).
- Ultrapassar os limites obriga a **novo procedimento**, se a entidade mantiver
  a decisão de contratar.

### 5. O gestor do contrato foi alterado — e a favor do que já temos

O artigo **290.º-A** mantém a obrigatoriedade e passa a admitir **«um ou mais
gestores do contrato»**, exigindo que, havendo mais do que um, se definam com
clareza as funções e responsabilidades de cada um. Reforça deveres de
imparcialidade e prevenção de conflitos de interesses, e as declarações dos
anexos I, II e XIII dão lugar ao regime de impedimentos do CPA.

Isto **confirma** o desenho atual (`Contrato.gestores` como lista, com
`principal`) e a RN-116. Fica a faltar o campo de funções por gestor.

Há uma exceção nova: no **ajuste direto simplificado** dispensa-se a designação
de gestor. A RN-116 exige pelo menos um gestor sem olhar ao procedimento.

### 6. A Lei n.º 30/2021 foi esvaziada

Os artigos 2.º a 16.º da Lei n.º 30/2021 (medidas especiais) foram revogados
pelo artigo 8.º do DL 177/2026, e a «consulta prévia especial» passou para os
artigos 127.º-A a 127.º-C do CCP. O CHORA+ **não cita** a Lei n.º 30/2021 em
parte alguma, pelo que isto não gera dívida — mas fecha uma porta que um dia se
poderia querer abrir.

## Mapa: o que está no código e o que lhe acontece

| Código | Base citada hoje | Veredicto |
|---|---|---|
| `RN-301`, `dotacoes.ts:13` | `CCP, art. 370.º n.º 4` | **Base errada.** O n.º 4 foi revogado. Valor (50 %) mantém-se; falta a condição de inviabilidade de mudança de cocontratante |
| `COMPLEMENTARES_MAX_PCT = 0.5` | idem | Valor correto, **referência a corrigir** |
| — | — | **Regra em falta:** limiar de 10 % / 15 % do art. 312.º para modificações de reduzido valor |
| `INSTRUCAO_MODIFICACAO_DIAS = 30` | `CCP art. 311.º e ss.` | **Referência obsoleta.** Artigos reescritos; alteração imprevisível migra para 314.º-A/B |
| `RN-116`, `contratos.ts:135` | `CCP, art. 290.º-A n.º 1 e art. 96.º n.º 1 al. j)` | **Confirmada e reforçada.** Falta: funções por gestor; exceção do ajuste direto simplificado |
| `RN-202`, `prazos.ts:40`, `VIGENCIA_MAX_MESES = 36` | `CCP, art. 440.º e 48.º` | **Não verificado.** A regra dos 3 anos continua no texto consolidado; não confirmei se o 177/2026 lhe tocou |
| `recursos.ts:41` | `CCP, art. 316.º e ss. e art. 321.º-A` | **Não verificado** |
| `faturacao.ts:15` | `LCPA (Lei n.º 8/2012)` | **Não verificado** |
| `VISTO_PREVIO_LIMIAR_CENT = 750 000 €` | LOPTC + Lei do OE | **Correto em 2026** — ver abaixo |
| `INSTRUCAO_VISTO_MESES = 3` | LOPTC | Correto hoje; em risco — ver abaixo |

## O que está a mudar e ainda não mudou: o visto prévio

A reforma da Lei de Organização e Processo do Tribunal de Contas (Proposta de
Lei n.º 72/XVII) sobe o limiar da fiscalização prévia de **750 000 € para
10 000 000 €**, mantendo comunicação obrigatória ao Tribunal acima de 950 000 €
para fiscalização sucessiva ou concomitante. Foi aprovada na generalidade a 22
de maio de 2026 (PSD, CDS-PP, IL a favor; PS e JPP abstiveram-se) e, à data das
fontes consultadas (julho de 2026), **continuava na especialidade**, com um
parecer complementar do Tribunal de Contas com mais de 50 propostas de
alteração. Fala-se de um ajuste do limiar para 5 000 000 €. **Não confirmei se
houve votação final global.**

Se passar, o impacto no CHORA+ é grande e não está nas regras — está nos
alertas. O cálculo da janela de decisão do alerta «novo procedimento a lançar
em tempo útil» soma `INSTRUCAO_PROCEDIMENTO_MESES` (5) com
`INSTRUCAO_VISTO_MESES` (3). Se 90 % dos contratos deixarem de precisar de
visto, a aplicação passa a **antecipar em três meses** um prazo que já não
existe — e a dizer que o prazo se esgotou quando não se esgotou. O parâmetro
tem de passar a depender do valor do contrato, não de ser uma constante.

## Recomendação

1. **O restyling avança sem esperar.** É interface; não toca em regras nem em
   bases legais. As duas coisas não se bloqueiam.
2. **A revisão legal é tarefa própria, e precisa do texto oficial.** Sem acesso
   ao Código republicado, mudar números no catálogo seria trocar uma referência
   obsoleta por uma referência inventada.
3. **O que se pode fazer já, sem texto oficial:** marcar no catálogo as bases
   que se sabem obsoletas, para ninguém as citar de boa-fé. Uma base errada num
   ecrã de transparência é pior do que uma base ausente.
4. **O que o `BASE_LEGAL` ainda não sabe fazer.** Foi desenhado para parâmetros
   com vigência (`vigenteDe`/`vigenteAte`), e isso resolve valores que mudam.
   Não resolve **regras** que mudam: a partir de agora, dois contratos em
   execução podem estar sujeitos a regimes diferentes consoante a data de início
   do procedimento que lhes deu origem. O `Contrato` guarda
   `dataAssinaturaCA` e `dataInicioVigencia`, mas **não guarda a data de início
   do procedimento** — que é o critério de que o diploma faz depender a
   aplicação no tempo. É o campo que falta para que a versão da regra possa ser
   escolhida por contrato.

## Fontes

Nenhuma é oficial; ver o aviso no topo.

- [Boletim da Ordem dos Advogados — Aprovada 17.ª alteração ao CCP](https://boletim.oa.pt/2026/09/04/aprovada-17a-alteracao-ao-codigo-dos-contratos-publicos/)
- [Cerejeira Namora, Marinho Falcão — Alterações ao CCP: publicado o DL n.º 177/2026](https://www.cnmf.pt/pt/comunicacao/alteracoes-ao-codigo-dos-contratos-publicos-publicado-o-decreto-lei-n-1772026/1664/)
- [KPMG Portugal — Revisão do Código dos Contratos Públicos](https://kpmg.com/pt/pt/insights/law-updates/revisao-codigo-dos-contratos-publicos.html)
- [Helpdesk Público — Alterações ao CCP 2026](https://www.helpdeskpublico.pt/alteracoes-ccp-decreto-lei-177-2026)
- [AICCOPN — Principais alterações ao CCP (PDF)](https://www.aiccopn.pt/wp-content/uploads/2026/09/CCP_Info_Alteracao_DL177_2026_rev.pdf)
- [MB Advogados — Revisão do CCP: 10 alterações a reter](https://mb-advogados.pt/en/revisao-do-codigo-dos-contratos-publicos-10-alteracoes-a-reter/)
- [Safeminds — Novo CCP 2026](https://safeminds.pt/ccp-2026/)
- [ECO — O gestor do contrato na alteração ao CCP](https://eco.sapo.pt/opiniao/o-gestor-do-contrato-na-alteracao-ao-codigo-dos-contratos-publicos/)
- [Público — AR aprova lei do Tribunal de Contas (22-05-2026)](https://www.publico.pt/2026/05/22/politica/noticia/ar-aprova-lei-tribunal-contas-alarga-transporte-gratuito-excombatentes-2175673)
- [Observador — Contratos acima de 950 mil euros terão de ser comunicados ao TdC](https://observador.pt/2026/04/21/contratos-acima-de-950-mil-euros-terao-de-ser-comunicados-ao-tribunal-de-contas-mesmo-sem-visto-previo/)
- [Tribunal de Contas — parecer complementar à PL n.º 72/XVII (13-07-2026)](https://www.tcontas.pt/pt-pt/MenuSecundario/Noticias/Pages/n-20260713-1.aspx)
- [Diário da República — DL n.º 177/2026 (não acessível deste ambiente)](https://diariodarepublica.pt/dr/detalhe/decreto-lei/177-2026-1166969779)
