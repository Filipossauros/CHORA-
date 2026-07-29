# Ativos da mascote — Choramingas

Os três ficheiros deste diretório são **marcadores de posição** desenhados à mão
em SVG a partir das folhas de referência. Servem para as maquetas mostrarem a
escala e a colocação certas.

## Como substituir pelos definitivos

Guarde os ficheiros reais **com estes mesmos nomes**. Não é preciso tocar em
CSS nem em HTML.

| Ficheiro | Pose | Onde aparece | Proporção |
|---|---|---|---|
| `choramingas-hero.svg` | Com prancheta, cronómetro, pasta e gráfico | Faixa de boas-vindas do «Hoje» | 396 × 224 (landscape) |
| `choramingas-maestro.svg` | A distribuir pessoas pelos perfis | Faixa do separador «Afetações» | 396 × 224 (landscape) |
| `choramingas-aceno.svg` | A acenar, com brilhos | Avatar do assistente (42 px) e rodapé da lateral (36 px) | 1 : 1 |

## Formato

- **SVG é preferível**: escala sem perder nitidez, pesa uma fração e pode mudar
  de cor por CSS. As referências enviadas são bitmaps — se só existirem em PNG,
  mude a extensão nos três `<img src>` das maquetas.
- **PNG**: exporte a 2× o tamanho de utilização, com fundo transparente.
  Para o `aceno`, isso são 84 px e 72 px — exporte a 256 px e sobra margem.
- **Peso**: o `hero` e o `maestro` aparecem uma vez por ecrã; até ~120 KB cada
  é indiferente. O `aceno` aparece duas vezes e em todos os ecrãs — mantenha-o
  abaixo de 30 KB.

## Onde NÃO entra

A mascote fica fora dos cartões de decisão e de qualquer painel de confirmação
de ato — simulação, decisão de fatura, substituição. Num ecrã onde já competem
o prazo, o valor e o botão de ato, um boneco a mais rouba a leitura que
interessa; e num painel que pergunta «tem a certeza?» sobre um ato irreversível,
desloca o registo.
