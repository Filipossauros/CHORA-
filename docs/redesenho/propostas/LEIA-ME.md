# Propostas de redesenho — ecrãs principais

Sete maquetas HTML, com conteúdo real dos cenários de demonstração. Abrem
diretamente no browser (`file://`), sem servidor nem dependências.

## Os ficheiros

| Maqueta | Ecrã | O que a proposta muda |
|---|---|---|
| `hoje-v5.html` | **Hoje** — a fila de decisões | Faixa de boas-vindas com a mascote; decisões planas, sem painel interior; grupos por família de alerta |
| `contratos-v1.html` | **Contratos** — a carteira | A coluna de consumo dá lugar a **duas barras**: tempo decorrido e valor executado |
| `afetacoes-v1.html` | **Contrato › Afetações** | Perfis, pessoas afetas e histórico de encerradas, com a entidade executante marcada |
| `registos-v1.html` | **Registos e aprovações** | A fila de aprovação é o ecrã; cada linha traz o **veredicto das regras antes** de se aprovar |
| `faturacao-v1.html` | **Faturação** | O **veredicto** passa a ser o centro; o registo recolhe para um botão |
| `relatorios-v1.html` | **Relatórios** | Os relatórios guardados mostram a **receita** e o botão principal é «Executar» |
| `assistente-v1.html` | **Choramingas** | Mesa de trabalho colada ao campo; atos em cartão de simulação |

Para cada um há duas imagens: `nome.png` (o que se vê ao abrir, 1440×1000) e
`nome-completo.png` (a página inteira).

## Como estão organizados

- **`base.css`** — o sistema: fichas de cor, casca, controlos, cartões, tabelas,
  etiquetas. É o candidato natural a ficheiro de *design tokens* quando isto
  passar a código.
- **`casca.js`** — a lateral e a barra do assistente, escritas uma vez. Andaime
  de maqueta: na aplicação a casca é o componente `Shell`.
- **`ativos/`** — a mascote em PNG. Trocar o ficheiro chega; não há CSS a mudar.
- **`paleta.md`** — as cores, com a origem e o contraste de cada uma.
- **`capturar-proposta.mjs`** — regera as imagens:
  `node docs/redesenho/propostas/capturar-proposta.mjs [nome…]`

## As três regras que atravessam os sete ecrãs

1. **A mascote aparece no máximo uma vez por ecrã**, e nunca ao lado de um ato
   irreversível — simulação, decisão de fatura, substituição. Num painel que
   pergunta «tem a certeza?», um boneco desloca o registo.
2. **O que altera dados nunca chega como texto.** Chega em cartão, com o antes e
   o depois lado a lado e as regras verificadas por baixo.
3. **O código da regra é visível** (`RN-603`, `RN-701`). Não é ruído técnico: é
   o que permite a quem decide citar a norma em que se apoiou.

## Por decidir

- **Tema escuro** — manter ou deixar cair. A mascote precisa de variante sobre
  fundo escuro; o resto do sistema já tem os tokens para isso.
- **Ilustração do maestro nas Afetações** — ocupa meia faixa e empurra as tabelas
  para baixo. Alternativas: reduzir a um terço, ou usá-la só no estado vazio.
- **Cor do botão principal** — azul em todo o lado, ou laranja/amarelo a
  acompanhar a urgência da decisão, como está no «Hoje».
