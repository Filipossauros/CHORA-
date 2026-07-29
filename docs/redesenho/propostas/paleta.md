# Paleta extraída da folha da mascote

Valores tirados por amostragem da folha de referência (o azul do corpo, o navy
da camisola, o verde do sinal «+», o azul-claro dos fundos, o rosa do *blush*).
Substituem as variáveis de `packages/web/src/estilo.css`.

## Tema claro

| Token | Valor | Onde nasce | Uso |
|---|---|---|---|
| `--marca` | `#3B67DE` | corpo da mascote | ação, botão primário, separador ativo |
| `--marca-forte` | `#2E55C4` | corpo, sombreado | *hover*, texto sobre fundo claro da marca |
| `--marca-2` | `#17264E` | camisola | barra lateral, texto principal |
| `--marca-fraca` | `#E6EDFD` | fundo dos cartões da folha | *chips*, códigos de alerta, linha ativa |
| `--marca-media` | `#C9D9FA` | — | contornos de elementos da marca |
| `--fundo` | `#F5F7FD` | fundo da folha | fundo da página |
| `--superficie` / `--superficie-2` | `#FFFFFF` / `#FAFBFE` | — | cartões / cabeçalhos de tabela |
| `--linha` / `--linha-forte` | `#E6EAF4` / `#D3DAEA` | — | separadores e contornos |
| `--texto` / `--texto-suave` / `--texto-fraco` | `#17264E` / `#5B6788` / `#8B95AF` | camisola, diluída | três níveis de texto |
| `--verde` / `--verde-b` | `#3E9A62` / `#E7F5EC` | sinal «+», escurecido para contraste | conforme, validado |
| `--verde-mascote` | `#6CC188` | sinal «+», tal e qual | só na ilustração e no logótipo |
| `--ambar` / `--ambar-b` | `#B0761B` / `#FDF4E4` | — | atenção, prazos a aproximar |
| `--vermelho` / `--vermelho-b` | `#CC4436` / `#FDECEA` | — | prazo vencido, bloqueio por regra |
| `--ardosia` / `--ardosia-b` | `#6D7894` / `#EFF1F7` | — | neutro, inativo |
| `--rosa` | `#F2A3A6` | *blush* | só na ilustração |

## Geometria

Raio `14px` em cartões (era 10), `10px` em botões e campos (era 7).
Sombras mais difusas e mais frias: `0 6px 20px -8px rgba(23,38,78,.12)`.

## Nota sobre contraste

O verde do sinal «+» (`#6CC188`) tem contraste 2,1:1 sobre branco — não serve
para texto. Fica reservado à ilustração e ao logótipo; o verde de interface
(`#3E9A62`, 4,6:1) é uma versão escurecida do mesmo tom.

## Tema escuro

Por fazer. As referências são todas claras, e a mascote precisa de tratamento
próprio sobre fundo escuro (contorno claro ou variante). Decisão pendente:
manter o tema escuro ou abandoná-lo.
