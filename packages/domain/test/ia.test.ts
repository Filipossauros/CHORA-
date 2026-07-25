import { describe, it, expect } from 'vitest';
import { normalizarTexto, termosPerfil, semelhancaPerfil, perfisSemelhantes } from '../src/ia/similaridade.js';
import { AgenteStub } from '../src/ia/porta-agente.js';
import { classificar, contratoDaPergunta, responderPergunta, type DadosPergunta } from '../src/ia/perguntas.js';
import type { Contrato } from '../src/entidades/contrato.js';
import type { PerfilContratual, Alteracao } from '../src/entidades/estrutura.js';
import type { Alerta } from '../src/entidades/auditoria-alerta.js';

const audit = { criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u' };

const contrato = {
  id: 'c1', numero: 'C-2026-003', objeto: 'Serviços', estado: 'EM_VIGOR',
  precoContratualInicial: 100_000_00, precoContratualAtual: 142_000_00,
  prestador: { nome: 'Alfa', nipc: '500000001' },
  dataAssinaturaCA: '2025-12-01', dataInicioVigencia: '2026-01-01', dataTerminoContratual: '2027-12-31',
  vistoTribunalContasNecessario: false, gestores: [{ utilizadorId: 'g1', principal: true }], excecoes: [],
  ...audit,
} as Contrato;

const alteracao: Alteracao = {
  id: 'a1', contratoId: 'c1', tipo: 'SERVICOS_COMPLEMENTARES', dataEfeito: '2026-06-01',
  descricao: 'x', fundamentacao: 'y', valorAcrescido: 42_000_00,
  registadoEm: '2026-06-01T00:00:00.000Z', registadoPor: 'u', atualizadoEm: '2026-06-01T00:00:00.000Z', atualizadoPor: 'u',
};

const dados: DadosPergunta = {
  contratos: [contrato], perfis: [], alteracoes: [alteracao], aprovados: [], alertas: [], hoje: '2026-07-25',
};

describe('similaridade de perfis', () => {
  it('normaliza acentos, pontuação e maiúsculas', () => {
    expect(normalizarTexto('Arquiteto de Software Sénior')).toBe('arquiteto de software senior');
  });

  it('remove termos vazios e aplica sinónimos', () => {
    expect(termosPerfil('Developer Sénior de Software')).toEqual(['programador', 'senior', 'software']);
  });

  it('encontra papéis equivalentes que a comparação exata perdia', () => {
    // O caso concreto que falhava em silêncio.
    expect(semelhancaPerfil('Consultor Funcional', 'Consultor Funcional Sénior')).toBeGreaterThan(0.6);
    expect(semelhancaPerfil('Programador Sénior', 'Developer Senior')).toBeGreaterThan(0.6);
    expect(semelhancaPerfil('Arquiteto de Software', 'Software Architect')).toBeGreaterThan(0.6);
  });

  it('distingue papéis realmente diferentes', () => {
    expect(semelhancaPerfil('Consultor Funcional', 'Gestor de Projeto')).toBeLessThan(0.6);
    expect(semelhancaPerfil('Programador Sénior', 'Técnico de Testes')).toBeLessThan(0.6);
  });

  it('nomes iguais dão semelhança máxima', () => {
    expect(semelhancaPerfil('Consultor Funcional', 'consultor  funcional')).toBe(1);
  });

  it('ordena candidatos por semelhança e assinala a correspondência exata', () => {
    const r = perfisSemelhantes('Consultor Funcional', ['Gestor de Projeto', 'Consultor Funcional Sénior', 'Consultor Funcional']);
    expect(r[0]!.nome).toBe('Consultor Funcional');
    expect(r[0]!.exata).toBe(true);
    expect(r.map((x) => x.nome)).not.toContain('Gestor de Projeto');
  });
});

describe('agente (stub)', () => {
  const agente = new AgenteStub();

  it('extrai campos com confiança e assinala os duvidosos', async () => {
    const e = await agente.extrairDocumento('PORTARIA', 'portaria.pdf');
    expect(e.campos.length).toBeGreaterThan(0);
    expect(e.campos.every((c) => c.confianca > 0 && c.confianca <= 1)).toBe(true);
    expect(e.observacao).toContain('confiança baixa'); // a repartição 2027 tem 0,74
  });

  it('extrai os campos do contrato', async () => {
    const e = await agente.extrairDocumento('CONTRATO', 'contrato.pdf');
    expect(e.campos.map((c) => c.campo)).toContain('precoContratualInicial');
  });

  it('não inventa quando não há factos', async () => {
    const r = await agente.responder('qualquer coisa', { factos: {}, fontes: [] });
    expect(r.semResposta).toBe(true);
  });

  it('delega a correspondência de perfis na similaridade determinística', async () => {
    const r = await agente.corresponderPerfis('Consultor Funcional', ['Consultor Funcional Sénior', 'Gestor de Projeto']);
    expect(r).toHaveLength(1);
    expect(r[0]!.nome).toBe('Consultor Funcional Sénior');
  });
});

describe('resolvedor de perguntas', () => {
  it('classifica as intenções conhecidas', () => {
    expect(classificar('Quanto posso ainda gastar em complementares no C-2026-003?')).toBe('COMPLEMENTARES_DISPONIVEL');
    expect(classificar('Que perfis se esgotam antes do término?')).toBe('PERFIL_ESGOTAMENTO');
    expect(classificar('Até quando vai a vigência do contrato?')).toBe('VIGENCIA_CONTRATO');
    expect(classificar('O que tenho de decidir com urgência?')).toBe('DECISOES_PENDENTES');
    expect(classificar('qual a cor do céu')).toBe('DESCONHECIDA');
  });

  it('identifica o contrato pelo número', () => {
    expect(contratoDaPergunta('saldo do C-2026-003 hoje', [contrato])?.id).toBe('c1');
    expect(contratoDaPergunta('saldo do C-9999-999', [contrato])).toBeUndefined();
  });

  it('responde ao limite de complementares com os números certos e a proveniência', () => {
    const r = responderPergunta('Quanto posso ainda gastar em complementares no C-2026-003?', dados);
    // teto = 50 000 €, acumulado = 42 000 € → folga = 8 000 €
    // O agrupamento de milhares depende do ICU; o que importa são os valores.
    expect(r.texto).toMatch(/8\s?000,00\s?€/);
    expect(r.texto).toMatch(/50\s?000,00\s?€/);
    expect(r.fontes.some((f) => f.referencia.includes('RN-301'))).toBe(true);
    expect(r.fontes.every((f) => f.proveniencia === 'REGRA')).toBe(true);
  });

  it('a resposta de saldo separa a regra da projeção', () => {
    const r = responderPergunta('Qual o saldo por executar do C-2026-003?', dados);
    expect(r.fontes.some((f) => f.proveniencia === 'REGRA')).toBe(true);
    expect(r.fontes.some((f) => f.proveniencia === 'PROJECAO')).toBe(true);
  });

  it('responde à vigência com a margem até aos 36 meses', () => {
    const r = responderPergunta('Até quando vai a vigência do C-2026-003?', dados);
    expect(r.texto).toContain('24.0 meses');
    expect(r.texto).toContain('mais 12.0 meses');
  });

  it('pede o contrato quando a pergunta não o identifica', () => {
    const r = responderPergunta('quanto posso gastar em complementares?', dados);
    expect(r.semResposta).toBe(true);
    expect(r.texto).toContain('número do contrato');
  });

  it('resume as decisões pendentes pela mais urgente', () => {
    const alerta = {
      id: 'x', contratoId: 'c1', codigo: 'AL-FIM-ANO-ECONOMICO', chave: 'c1|AL-FIM-ANO-ECONOMICO',
      estado: 'ABERTA', severidade: 'CRITICO', titulo: 'Transição por pedir', detalhe: 'd',
      destinatarioId: 'g1', geradoEm: '2026-07-01T00:00:00.000Z',
      dataLimiteAcao: '2026-11-16', diasParaLimite: -8,
    } as Alerta;
    const r = responderPergunta('O que tenho de decidir com urgência?', { ...dados, alertas: [alerta] });
    expect(r.texto).toContain('1 decisão');
    expect(r.texto).toContain('prazo já vencido');
    expect(r.texto).toContain('16/11/2026');
  });

  it('não responde a perguntas fora do domínio', () => {
    const r = responderPergunta('qual a cor do céu no C-2026-003?', dados);
    expect(r.semResposta).toBe(true);
  });
});

describe('escada de opções com similaridade', () => {
  it('perfis de nome diferente mas papel equivalente passam a ser encontrados', async () => {
    const { alternativasParaPerfil } = await import('../src/calculos/opcoes.js');
    const outro = { ...contrato, id: 'c2', numero: 'C-2026-BH2', precoContratualAtual: 50_000_00 } as Contrato;
    const pAlvo: PerfilContratual = { id: 'p1', contratoId: 'c1', nome: 'Consultor Funcional', quantidadePrevista: 600, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, precos: [{ valorHora: 65_00, vigenteDe: '2026-01-01' }], ...audit };
    const pOutro: PerfilContratual = { id: 'p2', contratoId: 'c2', nome: 'Consultor Funcional Sénior', quantidadePrevista: 12000, consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, precos: [{ valorHora: 60_00, vigenteDe: '2026-01-01' }], ...audit };
    const alts = alternativasParaPerfil(pAlvo, contrato, [contrato, outro], [pAlvo, pOutro], [], '2026-07-25');
    expect(alts).toHaveLength(1);
    expect(alts[0]!.perfilNome).toBe('Consultor Funcional Sénior');
    expect(alts[0]!.semelhanca).toBeGreaterThan(0.6);
    expect(alts[0]!.semelhanca).toBeLessThan(1); // não é exata
  });
});
