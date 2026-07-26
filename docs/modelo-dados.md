# Modelo de dados (desenho MongoDB para o desenvolvimento final)

> Documento de referência para a implementação da camada de persistência
> (ADR-04). O protótipo **não** implementa MongoDB; as decisões de *embedding*
> vs. referência e os índices estão tomados.

## Coleções e índices

| Coleção | Documentos embebidos | Referências | Índices |
|---|---|---|---|
| `procedimentos` | `lotes[]` | `acordoQuadroId` | `{numero:1}` único |
| `contratos` | `dotacoes[]`, `perfis[]`, `gestores[]`, `excecoes[]`, `portariaExtensaoEncargos` | `loteId` | `{numero:1}` único; `{estado:1, dataTerminoContratual:1}`; `{"gestores.utilizadorId":1}` |
| `alteracoes` | — | `contratoId` | `{contratoId:1, dataEfeito:-1}` |
| `afetacoes` | — | `contratoId`, `perfilId`, `recursoId` | `{contratoId:1, ativa:1}`; `{recursoId:1, ativa:1}` |
| `registosTempo` | — | `afetacaoId` (+ desnormalizações) | `{recursoId:1, data:-1}`; `{contratoId:1, estado:1, data:-1}`; `{workItemId:1}`; `{projetoId:1, data:-1}` |
| `entregaveis` | — | `contratoId`, `faturaId` | `{contratoId:1, ordem:1}`; `{contratoId:1, entregue:1}` |
| `faturas` | `linhas[]`, `deducoes[]` | `contratoId`, `compromissoId`, `entregavelId` | `{contratoId:1, dataRececao:-1}`; `{numero:1, contratoId:1}` único |
| `documentosHabilitacao` | — | `contratoId` | `{validoAte:1}` |
| `alertas` | — | `contratoId` | `{destinatarioId:1, lidoEm:1}` |
| `eventosAuditoria` | — | — | `{entidade:1, entidadeId:1, ocorridoEm:-1}`; `{utilizadorId:1, ocorridoEm:-1}`; TTL **não aplicar** |

`entregaveis` (contratos chave-na-mão) fica em coleção própria, e não embebido
em `contratos` como os perfis: muda de estado ao ritmo da execução — entrega,
depois faturação — e é referenciado pela fatura que o liquida, ao passo que os
perfis são estrutura estável do contrato.

## Mapeamento de tipos para BSON

| Tipo do domínio | BSON | Justificação |
|---|---|---|
| `InstanteISO` | `Date` (UTC) | Ordenação e comparação nativas; é um instante absoluto. |
| `DataISO` | `string` `'YYYY-MM-DD'` | Guardar como `Date` reintroduziria ambiguidade de fuso. A ordenação lexicográfica coincide com a cronológica. |
| `MesISO` | `string` `'YYYY-MM'` | Idem. |
| `Cent`, `Minutos`, `AnoCivil` | `int32` / `long` | Nunca `double`. |

`registosTempo` é a coleção crítica de volume (2 M/ano, 10 M acumulados):
manter o documento estreito, sem *arrays*, e servir relatórios por *aggregation
pipeline*. Recomenda-se um campo `mes: MesISO` desnormalizado com índice
`{contratoId:1, mes:1}`.
