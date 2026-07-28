import { describe, it, expect } from 'vitest';
import { avaliarCarteira, contratosATerminar, resumoCarteira } from '../src/calculos/carteira.js';
import type { Contrato } from '../src/entidades/contrato.js';
import type { PerfilContratual } from '../src/entidades/estrutura.js';
import type { RegistoTempo } from '../src/entidades/registo-tempo.js';
import type { Fatura } from '../src/entidades/faturacao.js';

const audit = { criadoEm: '2026-01-01T00:00:00.000Z', criadoPor: 'u', atualizadoEm: '2026-01-01T00:00:00.000Z', atualizadoPor: 'u' };
const HOJE = '2026-07-21';

function contrato(over: Partial<Contrato> & Pick<Contrato, 'id' | 'numero'>): Contrato {
  return {
    objeto: 'Serviços', estado: 'EM_VIGOR', tipologia: 'BOLSA_HORAS',
    precoContratualInicial: 100_000_00, precoContratualAtual: 100_000_00,
    prestador: { nome: 'Alfa', nipc: '500000001' },
    dataAssinaturaCA: '2026-01-01', dataInicioVigencia: '2026-01-01',
    dataTerminoContratual: '2028-12-31', dataTerminoOriginal: '2028-12-31',
    vistoTribunalContasNecessario: false, gestores: [], excecoes: [], ...audit, ...over,
  } as Contrato;
}

function perfil(over: Partial<PerfilContratual> & Pick<PerfilContratual, 'id' | 'contratoId' | 'nome'>): PerfilContratual {
  return {
    quantidadePrevista: 120_000, consomeBolsaValor: false, consomeTrabalhosComplementares: false,
    perfilDeGestao: false, precos: [{ valorHora: 50_00, vigenteDe: '2026-01-01' }], ...audit, ...over,
  } as PerfilContratual;
}

function registo(over: Partial<RegistoTempo> & Pick<RegistoTempo, 'id' | 'contratoId' | 'perfilId' | 'data'>): RegistoTempo {
  return {
    afetacaoId: 'a1', recursoId: 'r1', projetoId: 'p', workItemId: 1,
    duracao: 480, descricaoAtividade: 'x', tipoDotacaoConsumida: 'HORAS_BASE',
    valorHoraAplicado: 50_00, valorImputado: 400_00, estado: 'APROVADO', ...audit, ...over,
  } as RegistoTempo;
}

describe('risco da carteira', () => {
  it('um contrato sem motivo nenhum não entra na lista', () => {
    // Sem perfis, sem execução e com término longínquo: nada a assinalar.
    const c = contrato({ id: 'c1', numero: 'C-1', precoContratualAtual: 0 });
    expect(avaliarCarteira([c], [], [], [], HOJE)).toEqual([]);
  });

  it('folga significativa entra com o valor que a sustenta', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const r = avaliarCarteira([c], [], [], [], HOJE);
    const motivo = r[0]?.motivos.find((m) => m.motivo === 'FOLGA_POR_EXECUTAR');
    expect(motivo?.valor).toBe(100_000_00);
    // O separador de milhares é espaço não separável (pt-PT).
    expect(motivo?.descricao.replace(/\u00a0/g, ' ')).toMatch(/100 000,00 €/);
  });

  it('folga abaixo de 15% é ruído de projeção, não risco', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', precoContratualAtual: 1000_00 });
    // Execução recente que projeta consumir quase tudo.
    const regs = Array.from({ length: 20 }, (_, i) =>
      registo({ id: `r${i}`, contratoId: 'c1', perfilId: 'p1', data: `2026-07-${String(i + 1).padStart(2, '0')}`, valorImputado: 45_00 }));
    const r = avaliarCarteira([c], [], [], regs, HOJE);
    expect(r.flatMap((x) => x.motivos).some((m) => m.motivo === 'FOLGA_POR_EXECUTAR')).toBe(false);
  });

  it('perfil com horas e ninguém afeto é sinalizado', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const p = perfil({ id: 'p1', contratoId: 'c1', nome: 'Arquiteto' });
    const r = avaliarCarteira([c], [p], [], [], HOJE);
    const motivo = r[0]?.motivos.find((m) => m.motivo === 'SEM_PESSOAS');
    expect(motivo?.descricao).toContain('Arquiteto');
  });

  it('a afetação ativa afasta o motivo «sem pessoas»', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const p = perfil({ id: 'p1', contratoId: 'c1', nome: 'Arquiteto' });
    const r = avaliarCarteira([c], [p], [{ perfilId: 'p1', ativa: true }], [], HOJE);
    expect(r[0]?.motivos.some((m) => m.motivo === 'SEM_PESSOAS')).toBe(false);
  });

  it('término próximo e prazo de procedimento esgotado', () => {
    const proximo = contrato({ id: 'c1', numero: 'C-1', dataTerminoContratual: '2026-10-31' });
    const tardio = contrato({ id: 'c2', numero: 'C-2', dataTerminoContratual: '2026-08-15' });
    const r = avaliarCarteira([proximo, tardio], [], [], [], HOJE);
    const motivos = (n: string): string[] => r.find((x) => x.numero === n)!.motivos.map((m) => m.motivo);
    expect(motivos('C-2')).toContain('PROCEDIMENTO_TARDIO');
    // Os dois motivos excluem-se: ou o prazo passou, ou ainda vai a tempo.
    expect(motivos('C-2')).not.toContain('TERMINO_PROXIMO');
  });

  it('ordena do mais exposto ao menos', () => {
    const grave = contrato({ id: 'c1', numero: 'GRAVE', dataTerminoContratual: '2026-08-15' });
    const leve = contrato({ id: 'c2', numero: 'LEVE', dataTerminoContratual: '2028-12-31' });
    const r = avaliarCarteira([grave, leve], [], [], [], HOJE);
    expect(r[0]?.numero).toBe('GRAVE');
    expect(r[0]!.pontuacao).toBeGreaterThan(r[1]!.pontuacao);
  });

  it('contratos fora de execução não são avaliados', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', estado: 'TERMINADO' });
    expect(avaliarCarteira([c], [], [], [], HOJE)).toEqual([]);
  });

  it('a suspensão é motivo por si só', () => {
    const c = contrato({ id: 'c1', numero: 'C-1', estado: 'SUSPENSO' });
    expect(avaliarCarteira([c], [], [], [], HOJE)[0]?.motivos.some((m) => m.motivo === 'SUSPENSO')).toBe(true);
  });
});

describe('contratos a terminar', () => {
  it('filtra pelo intervalo e traz o prazo do procedimento seguinte', () => {
    const dentro = contrato({ id: 'c1', numero: 'DENTRO', dataTerminoContratual: '2026-11-30' });
    const fora = contrato({ id: 'c2', numero: 'FORA', dataTerminoContratual: '2027-06-30' });
    const r = contratosATerminar([dentro, fora], [], '2026-01-01', '2026-12-31', HOJE);
    expect(r.map((x) => x.numero)).toEqual(['DENTRO']);
    expect(r[0]?.dataLimiteProcedimento).toBeDefined();
    expect(r[0]?.valorPorExecutar).toBe(100_000_00);
  });

  it('o visto prévio alarga a antecedência exigida', () => {
    const semVisto = contrato({ id: 'c1', numero: 'SEM', dataTerminoContratual: '2026-12-31' });
    const comVisto = contrato({ id: 'c2', numero: 'COM', dataTerminoContratual: '2026-12-31', vistoTribunalContasNecessario: true });
    const r = contratosATerminar([semVisto, comVisto], [], '2026-01-01', '2026-12-31', HOJE);
    const prazo = (n: string): string => r.find((x) => x.numero === n)!.dataLimiteProcedimento;
    expect(prazo('COM') < prazo('SEM')).toBe(true);
  });

  it('ordena por data de término', () => {
    const tarde = contrato({ id: 'c1', numero: 'TARDE', dataTerminoContratual: '2026-12-01' });
    const cedo = contrato({ id: 'c2', numero: 'CEDO', dataTerminoContratual: '2026-09-01' });
    expect(contratosATerminar([tarde, cedo], [], '2026-01-01', '2026-12-31', HOJE).map((x) => x.numero))
      .toEqual(['CEDO', 'TARDE']);
  });
});

describe('resumo da carteira', () => {
  const fatura = (over: Partial<Fatura> & Pick<Fatura, 'id' | 'contratoId'>): Fatura => ({
    numero: 'F', numeroContratoIndicado: 'C-1', nifPrestadorIndicado: '500000001',
    documentos: [], linhas: [], estado: 'VALIDADA', tipo: 'BOLSA_HORAS',
    dataEmissao: '2026-06-01', dataRececao: '2026-06-02', periodoDe: '2026-05-01', periodoAte: '2026-05-31',
    montanteSemIva: 0, montanteIva: 0, ...audit, ...over,
  } as Fatura);

  it('separa executado de faturado e apura o que falta faturar', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const regs = [registo({ id: 'r1', contratoId: 'c1', perfilId: 'p1', data: '2026-05-10', valorImputado: 10_000_00 })];
    const fats = [fatura({ id: 'f1', contratoId: 'c1', montanteSemIva: 4_000_00, montanteAprovado: 4_000_00 })];
    const r = resumoCarteira([c], regs, fats);
    expect(r.executado).toBe(10_000_00);
    expect(r.faturadoValidado).toBe(4_000_00);
    expect(r.porFaturar).toBe(6_000_00);
    expect(r.porExecutar).toBe(90_000_00);
  });

  it('as faturas por decidir não contam como validadas', () => {
    const c = contrato({ id: 'c1', numero: 'C-1' });
    const fats = [fatura({ id: 'f1', contratoId: 'c1', estado: 'EM_CONFERENCIA', montanteSemIva: 9_000_00 })];
    expect(resumoCarteira([c], [], fats).faturadoValidado).toBe(0);
  });

  it('agrupa por tipologia', () => {
    const bh = contrato({ id: 'c1', numero: 'BH', tipologia: 'BOLSA_HORAS' });
    const lic = contrato({ id: 'c2', numero: 'LIC', tipologia: 'LICENCIAMENTO', precoContratualAtual: 40_000_00 });
    const r = resumoCarteira([bh, lic], [], []);
    expect(r.contratos).toBe(2);
    expect(r.porTipologia.find((t) => t.tipologia === 'LICENCIAMENTO')?.contratado).toBe(40_000_00);
  });
});
