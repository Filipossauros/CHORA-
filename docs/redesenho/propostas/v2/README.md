# Proposta v2 — simplificar para tornar viável

Maquetas estáticas. Abrir `decisoes.html` num navegador; as capturas estão em
`capturas/`.

| Ficheiro | O que propõe |
|---|---|
| `linguagem.html` | A linguagem de desenho: cor, estado, densidade, e o que sai |
| `decisoes.html` | O «Hoje» refeito como fila de decisões |
| `contratos.html` | A lista de contratos |
| `contrato.html` | A ficha do contrato, de 5 separadores para 3 |
| `registos.html` | Registo de tempo e aprovações |

## O problema, medido

O ecrã de entrada da aplicação atual, com os dados de demonstração carregados:

| | hoje | proposta |
|---|---|---|
| altura da página | **13 359 px** | 1 164 px |
| botões | **244** | 7 |

Treze metros de ecrã e 244 controlos para responder a «por onde começo». A causa
não é a quantidade de alertas — são 74, e são reais. É o facto de **todos**
estarem abertos ao mesmo tempo, cada um como cartão expandido com o seu texto,
a sua escada de opções e os seus botões.

## As três decisões de desenho

1. **A cor não decora.** O azul é ação e só ação; o vermelho, o âmbar e o verde
   são estado e só estado. As cinco famílias de alerta deixam de ter cor própria
   e passam a ser texto — a cor fica livre para dizer o que é urgente.
2. **Listas são tabelas.** A fila de decisões passa de cartões a linhas que
   abrem uma de cada vez. O cartão fica para o que é um objeto só.
3. **O que está fechado não conta para a carga.** O ecrã começa no que tem prazo
   esgotado e no que o perde este mês — nove decisões. As outras 65 estão a um
   clique.

## O que sai, e o que fica à espera

| | estado | porquê |
|---|---|---|
| Mascote (3 ilustrações) | **removida** | Ganha-se sobriedade institucional; a identidade passa para a cor e a tipografia |
| Assistente «Choramingas» | **em espera** | 426 linhas de interface sobre funções que ainda não são indispensáveis |
| Conferência de faturas | **em espera** | A parte mais especulativa e a única que depende de OCR |
| Relatórios | **dissolve-se** | Metade vinha do assistente; o resto pertence à ficha do contrato |
| Orçamentação | **em espera** | Trabalho de uma época do ano, não do dia a dia |

Nada disto se apaga: os serviços, as regras e os testes do domínio ficam
intactos. Sai a interface e sai do menu.

## Navegação

De **onze destinos** (cinco no menu, seis na gaveta) para **três de trabalho**
mais quatro de administração na gaveta:

```
Trabalho                        Configurações e outros
  Decisões                        Recursos
  Contratos                       Regras e alertas
  Registos e aprovações           Auditoria
                                  Acessos
```

A ficha do contrato passa de cinco separadores (Ficha · Ações · Afetações ·
Entregáveis · Modificações) para três (Ficha · Equipa e perfis · Execução). As
«Ações» deixam de ser separador e passam a faixa no topo: um separador escondia
justamente aquilo que não deve ser preciso procurar.
