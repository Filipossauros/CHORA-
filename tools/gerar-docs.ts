import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATALOGO_REGRAS, FAMILIAS_REGRAS, CATALOGO_ALERTAS, FAMILIAS_ALERTAS } from '../packages/domain/src/index.js';
import { gerarOpenApi } from '../packages/api/src/openapi/documento.js';

/**
 * `pnpm docs` — regenera a documentação derivada do código (secção 4.3):
 * catalogo-regras.md, modelo-dados.md e openapi.yaml.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(raiz, 'docs');
mkdirSync(join(docs, 'adr'), { recursive: true });

// --- catalogo-regras.md (gerado a partir do código) ---------------------------
function gerarCatalogo(): string {
  const linhas: string[] = [
    '# Catálogo de regras de negócio',
    '',
    '> Documento **gerado** a partir de `packages/domain/src/rules/` por `pnpm docs`. Não editar à mão.',
    '',
    `Total de regras: **${CATALOGO_REGRAS.length}**.`,
    '',
  ];
  for (const [familia, regras] of Object.entries(FAMILIAS_REGRAS)) {
    linhas.push(`## ${familia}`, '');
    linhas.push('| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |');
    linhas.push('|---|---|---|---|---|---|');
    for (const r of regras) {
      const tipo = r.bloqueia === false ? 'aviso' : 'bloqueio';
      const exc = r.excecaoFundamentavel ? 'sim' : 'não';
      linhas.push(`| ${r.codigo} | ${tipo} | ${r.requisito} | ${exc} | ${r.descricao} | ${r.base} |`);
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

// --- catalogo-alertas.md (regras de alertas, separadas) -----------------------
function gerarCatalogoAlertas(): string {
  const linhas: string[] = [
    '# Catálogo de regras de alertas',
    '',
    '> Documento **gerado** a partir de `packages/domain/src/alertas/` por `pnpm docs`. Não editar à mão.',
    '',
    'As regras de alertas (AL-xxx) estão **separadas** das regras de negócio (RN-xxx)',
    'para facilidade de gestão. Os alertas são sempre **consultivos**: sinalizam',
    'preocupações de execução, não bloqueiam decisões.',
    '',
    'Os alertas com **janela de decisão** indicam a data-limite para agir, calculada',
    'para trás a partir do evento-âncora com o prazo de instrução do ato (parametrizado',
    'na base legal versionada). Nesses, a severidade escala à medida que a janela se fecha.',
    '',
    `Total de alertas: **${CATALOGO_ALERTAS.length}**.`,
    '',
  ];
  for (const familia of FAMILIAS_ALERTAS) {
    const daFamilia = CATALOGO_ALERTAS.filter((a) => a.familia === familia);
    if (daFamilia.length === 0) continue;
    linhas.push(`## ${familia}`, '');
    linhas.push('| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota |');
    linhas.push('|---|---|---|---|---|---|---|');
    for (const a of daFamilia) {
      linhas.push(`| ${a.codigo} | ${a.titulo} | ${a.descricao} | ${a.severidadeBase} | ${a.temJanelaDecisao === true ? a.eventoAncora ?? 'sim' : '—'} | ${a.regraRelacionada ?? '—'} | ${a.base ?? '—'} |`);
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

// --- modelo-dados.md ----------------------------------------------------------
function gerarModeloDados(): string {
  return `# Modelo de dados (desenho MongoDB para o desenvolvimento final)

> Documento de referência para a implementação da camada de persistência
> (ADR-04). O protótipo **não** implementa MongoDB; as decisões de *embedding*
> vs. referência e os índices estão tomados.

## Coleções e índices

| Coleção | Documentos embebidos | Referências | Índices |
|---|---|---|---|
| \`procedimentos\` | \`lotes[]\` | \`acordoQuadroId\` | \`{numero:1}\` único |
| \`contratos\` | \`dotacoes[]\`, \`perfis[]\`, \`gestores[]\`, \`excecoes[]\`, \`portariaExtensaoEncargos\` | \`loteId\` | \`{numero:1}\` único; \`{estado:1, dataTerminoContratual:1}\`; \`{"gestores.utilizadorId":1}\` |
| \`alteracoes\` | — | \`contratoId\` | \`{contratoId:1, dataEfeito:-1}\` |
| \`afetacoes\` | — | \`contratoId\`, \`perfilId\`, \`recursoId\` | \`{contratoId:1, ativa:1}\`; \`{recursoId:1, ativa:1}\` |
| \`registosTempo\` | — | \`afetacaoId\` (+ desnormalizações) | \`{recursoId:1, data:-1}\`; \`{contratoId:1, estado:1, data:-1}\`; \`{workItemId:1}\`; \`{projetoId:1, data:-1}\` |
| \`entregaveis\` | — | \`contratoId\`, \`faturaId\` | \`{contratoId:1, ordem:1}\`; \`{contratoId:1, entregue:1}\` |
| \`faturas\` | \`linhas[]\`, \`deducoes[]\` | \`contratoId\`, \`compromissoId\`, \`entregavelId\` | \`{contratoId:1, dataRececao:-1}\`; \`{numero:1, contratoId:1}\` único |
| \`documentosHabilitacao\` | — | \`contratoId\` | \`{validoAte:1}\` |
| \`alertas\` | — | \`contratoId\` | \`{destinatarioId:1, lidoEm:1}\` |
| \`eventosAuditoria\` | — | — | \`{entidade:1, entidadeId:1, ocorridoEm:-1}\`; \`{utilizadorId:1, ocorridoEm:-1}\`; TTL **não aplicar** |

\`entregaveis\` (contratos chave-na-mão) fica em coleção própria, e não embebido
em \`contratos\` como os perfis: muda de estado ao ritmo da execução — entrega,
depois faturação — e é referenciado pela fatura que o liquida, ao passo que os
perfis são estrutura estável do contrato.

## Mapeamento de tipos para BSON

| Tipo do domínio | BSON | Justificação |
|---|---|---|
| \`InstanteISO\` | \`Date\` (UTC) | Ordenação e comparação nativas; é um instante absoluto. |
| \`DataISO\` | \`string\` \`'YYYY-MM-DD'\` | Guardar como \`Date\` reintroduziria ambiguidade de fuso. A ordenação lexicográfica coincide com a cronológica. |
| \`MesISO\` | \`string\` \`'YYYY-MM'\` | Idem. |
| \`Cent\`, \`Minutos\`, \`AnoCivil\` | \`int32\` / \`long\` | Nunca \`double\`. |

\`registosTempo\` é a coleção crítica de volume (2 M/ano, 10 M acumulados):
manter o documento estreito, sem *arrays*, e servir relatórios por *aggregation
pipeline*. Recomenda-se um campo \`mes: MesISO\` desnormalizado com índice
\`{contratoId:1, mes:1}\`.
`;
}

// --- openapi.yaml (mini-emissor YAML) -----------------------------------------
function paraYaml(valor: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (valor === null || valor === undefined) return 'null';
  if (typeof valor === 'string') {
    return /[:#{}\[\],&*!|>'"%@`\n]/.test(valor) || valor === '' ? JSON.stringify(valor) : valor;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) {
    if (valor.length === 0) return '[]';
    return valor
      .map((item) => {
        const s = paraYaml(item, indent + 1);
        if (typeof item === 'object' && item !== null) {
          return `${pad}-\n${s}`;
        }
        return `${pad}- ${s}`;
      })
      .join('\n');
  }
  const entradas = Object.entries(valor as Record<string, unknown>);
  if (entradas.length === 0) return '{}';
  return entradas
    .map(([chave, v]) => {
      const chaveSegura = /[:#\s]/.test(chave) ? JSON.stringify(chave) : chave;
      if (typeof v === 'object' && v !== null) {
        const filho = paraYaml(v, indent + 1);
        if (Array.isArray(v) && v.length === 0) return `${pad}${chaveSegura}: []`;
        if (!Array.isArray(v) && Object.keys(v).length === 0) return `${pad}${chaveSegura}: {}`;
        return `${pad}${chaveSegura}:\n${filho}`;
      }
      return `${pad}${chaveSegura}: ${paraYaml(v, indent + 1)}`;
    })
    .join('\n');
}

const openapi = gerarOpenApi();
writeFileSync(join(docs, 'catalogo-regras.md'), gerarCatalogo(), 'utf8');
writeFileSync(join(docs, 'catalogo-alertas.md'), gerarCatalogoAlertas(), 'utf8');
writeFileSync(join(docs, 'modelo-dados.md'), gerarModeloDados(), 'utf8');
writeFileSync(join(docs, 'openapi.yaml'), `# Gerado por pnpm docs — não editar à mão.\n${paraYaml(openapi)}\n`, 'utf8');

// eslint-disable-next-line no-console
console.log(`Documentação gerada em docs/: catalogo-regras.md (${CATALOGO_REGRAS.length} regras), modelo-dados.md, openapi.yaml`);
