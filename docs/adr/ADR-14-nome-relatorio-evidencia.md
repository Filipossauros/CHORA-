# ADR-14 — Materialização do nome no relatório de evidência

## Estado
Aceite como decisão; implementação diferida (o `RelatorioEvidencia` é stub no
protótipo — secção 2.2 e ponto de extensão `IFaturaValidator`).

## Contexto
A secção 9.4 estabelece que o nome do utilizador **não é persistido**: guarda-se
apenas `utilizadorId` (oid do Entra ID), resolvido dinamicamente para
apresentação e descartado após uso. Há, porém, uma exceção deliberada: os
`RelatorioEvidencia` arquivados fazem parte do processo de despesa pública e têm
de permanecer inteligíveis anos depois, mesmo que o recurso já não exista no
diretório.

## Decisão
No momento da emissão de um `RelatorioEvidencia`, o nome do recurso é resolvido
através de `DirectorioIdentidades` (secção 14) e **materializado** no documento
arquivado. Esta é a única situação em que um nome é persistido, e é registada
aqui de forma explícita para não contradizer a política de minimização.

Fora desta exceção, mantém-se a regra: nenhuma entidade persiste nomes; a
auditoria e os registos usam sempre `utilizadorId`.

## Consequências
- O `RelatorioEvidencia` continua legível após a saída do recurso do diretório.
- A implementação concreta acompanha o encaixe do módulo de conferência de
  faturas no desenvolvimento final.
