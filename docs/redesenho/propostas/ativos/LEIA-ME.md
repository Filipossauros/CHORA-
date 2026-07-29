# Ativos da mascote — Choramingas

Os três PNG deste diretório são os **definitivos**. Chegaram a 1536 × 1024 com
fundo transparente e um halo ténue a cobrir toda a tela; foram recortados pela
caixa real do desenho (limiar de alfa > 60, com 2 % de margem) e reduzidos —
7 MB no total, para 0,9 MB.

| Ficheiro | Pose | Onde aparece | Tamanho | Peso |
|---|---|---|---|---|
| `choramingas-hero.png` | Com prancheta, cronómetro, pasta e gráfico | Faixa de boas-vindas do «Hoje» | 800 × 552 | 636 KB |
| `choramingas-maestro.png` | A distribuir pessoas pelos perfis | Faixa do separador «Afetações» | 800 × 375 | 277 KB |
| `choramingas-aceno.png` | A acenar, com brilhos | Avatar do assistente, rodapé da lateral, faixas compactas | 200 × 208 | 59 KB |

Os `.svg` com os mesmos nomes são os marcadores de posição desenhados à mão que
serviram enquanto os definitivos não existiam. Ficam como referência de
enquadramento e escala; nenhuma maqueta os usa.

## Para substituir

Guarde por cima, com o mesmo nome. Não é preciso tocar em CSS nem em HTML — o
dimensionamento é feito por `.mascote`, `.mascote.hero` (máx. 300 px) e
`.mascote.faixa` (máx. 420 px), em `base.css`.

Se um dia houver versões vetoriais, prefira-as: escalam sem perder nitidez,
pesam uma fração e podem mudar de cor por CSS. Nesse caso mude a extensão nos
`<img src>` das maquetas.

## Peso

O `hero` e o `maestro` aparecem uma vez por ecrã — 636 KB é tolerável numa
maqueta, mas em produção convém passar por WebP/AVIF. O `aceno` aparece **em
todos os ecrãs**, duas ou três vezes: mantenha-o abaixo de 60 KB.

## Onde NÃO entra

A mascote fica fora dos cartões de decisão e de qualquer painel de confirmação
de ato — simulação, decisão de fatura, substituição. Num ecrã onde já competem
o prazo, o valor e o botão de ato, um boneco a mais rouba a leitura que
interessa; e num painel que pergunta «tem a certeza?» sobre um ato irreversível,
desloca o registo.

Uma vez por ecrã, no máximo.
