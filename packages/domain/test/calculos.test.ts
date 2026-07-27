import { describe, it, expect } from 'vitest';
import type { PerfilContratual } from '../src/entidades/estrutura.js';
import type { RegistoTempo } from '../src/entidades/registo-tempo.js';
import type { Contrato } from '../src/entidades/contrato.js';
import type { Alteracao } from '../src/entidades/estrutura.js';
import {
  precoVigente,
  valorHoraVigente,
  valorImputado,
} from '../src/calculos/preco-perfil.js';
import { calcularConsumoPerfil, minutosDisponiveisPerfil } from '../src/calculos/consumo.js';
import {
  complementaresAcumulados,
  percentagemComplementares,
  totalFaturado,
  valorPrevistoPerfil,
} from '../src/calculos/financeira.js';
import {
  excedeLimiteVigencia,
  fimEfetivoVigencia,
  terminoExecucaoAjustado,
} from '../src/calculos/prazos.js';

const audit = {
  criadoEm: '2026-01-01T00:00:00.000Z',
  criadoPor: 'u1',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoPor: 'u1',
};

function perfil(precos: PerfilContratual['precos']): PerfilContratual {
  return {
    id: 'p1',
    contratoId: 'c1',
    nome: 'Programador',
    quantidadePrevista: 6000, // 100 h
    consomeBolsaValor: false,
    consomeTrabalhosComplementares: false,
    perfilDeGestao: false,
    precos,
    ...audit,
  };
}

function registo(over: Partial<RegistoTempo>): RegistoTempo {
  return {
    id: 'r1',
    afetacaoId: 'a1',
    contratoId: 'c1',
    perfilId: 'p1',
    recursoId: 'res1',
    projetoId: 'proj1',
    workItemId: 1,
    data: '2026-03-10',
    duracao: 60,
    descricaoAtividade: 'x',
    tipoDotacaoConsumida: 'HORAS_BASE',
    valorHoraAplicado: 5000,
    valorImputado: 5000,
    estado: 'APROVADO',
    criadoEm: '2026-03-10T09:00:00.000Z',
    criadoPor: 'res1',
    atualizadoEm: '2026-03-10T09:00:00.000Z',
    atualizadoPor: 'res1',
    ...over,
  };
}

describe('preço por perfil — série temporal (ADR-09, RN-506)', () => {
  const p = perfil([
    { valorHora: 5000, vigenteDe: '2026-01-01', vigenteAte: '2026-06-30' },
    { valorHora: 5500, vigenteDe: '2026-07-01' },
  ]);

  it('resolve o preço vigente na data', () => {
    expect(valorHoraVigente(p, '2026-03-10')).toBe(5000);
    expect(valorHoraVigente(p, '2026-08-10')).toBe(5500);
  });

  it('devolve null fora de qualquer vigência', () => {
    const so = perfil([{ valorHora: 5000, vigenteDe: '2026-07-01' }]);
    expect(precoVigente(so, '2026-01-01')).toBeNull();
    expect(valorHoraVigente(so, '2026-01-01')).toBeNull();
  });

  it('calcula o valor imputado (arredondamento ao cêntimo)', () => {
    expect(valorImputado(60, 5000)).toBe(5000);
    expect(valorImputado(90, 5000)).toBe(7500);
    expect(valorImputado(15, 5000)).toBe(1250);
  });
});

describe('consumo do perfil (RN-503/505)', () => {
  const p = perfil([{ valorHora: 5000, vigenteDe: '2026-01-01' }]);
  const registos = [
    registo({ id: 'r1', duracao: 60, valorImputado: 5000 }),
    registo({ id: 'r2', duracao: 120, valorImputado: 10000, tipoDotacaoConsumida: 'BOLSA_VALOR' }),
  ];

  it('agrega minutos e valor por tipo', () => {
    const c = calcularConsumoPerfil(p, registos);
    expect(c.minutosConsumidos).toBe(180);
    expect(c.minutosPorTipo.HORAS_BASE).toBe(60);
    expect(c.minutosPorTipo.BOLSA_VALOR).toBe(120);
    expect(c.valorConsumido).toBe(15000);
    expect(c.percentagemHoras).toBeCloseTo(180 / 6000, 5);
  });

  it('minutos disponíveis nunca negativos', () => {
    expect(minutosDisponiveisPerfil(p, registos)).toBe(6000 - 180);
    const cheio = [registo({ duracao: 7000, valorImputado: 0 })];
    expect(minutosDisponiveisPerfil(p, cheio)).toBe(0);
  });
});

describe('execução financeira (RN-105/301/607)', () => {
  const contrato = {
    precoContratualInicial: 100_000_00,
  } as unknown as Contrato;

  const alteracoes: Alteracao[] = [
    {
      id: 'alt1',
      contratoId: 'c1',
      tipo: 'SERVICOS_COMPLEMENTARES',
      dataEfeito: '2026-06-01',
      descricao: 'x',
      fundamentacao: 'y',
      valorAcrescido: 42_000_00,
      registadoEm: '2026-06-01T00:00:00.000Z',
      registadoPor: 'u1',
      atualizadoEm: '2026-06-01T00:00:00.000Z',
      atualizadoPor: 'u1',
    },
  ];

  it('acumula complementares e calcula percentagem sobre o preço inicial', () => {
    expect(complementaresAcumulados(alteracoes)).toBe(42_000_00);
    expect(percentagemComplementares(contrato, alteracoes)).toBeCloseTo(0.42, 5);
    expect(percentagemComplementares({ precoContratualInicial: 0 } as Contrato, alteracoes)).toBe(0);
  });

  it('valor previsto do perfil usa o preço mais recente', () => {
    const p = perfil([
      { valorHora: 5000, vigenteDe: '2026-01-01', vigenteAte: '2026-06-30' },
      { valorHora: 6000, vigenteDe: '2026-07-01' },
    ]);
    expect(valorPrevistoPerfil(p)).toBe(Math.round((6000 * 6000) / 60));
    expect(valorPrevistoPerfil(perfil([]))).toBe(0);
  });

  it('total faturado só conta as faturas validadas', () => {
    // O pagamento não é modelado: o que a aplicação sabe é o que aprovou.
    const base = { ...audit };
    const faturas = [
      { estado: 'VALIDADA', montanteAprovado: 10000, ...base },
      { estado: 'VALIDADA', montanteAprovado: 5000, ...base },
      { estado: 'INVALIDADA', montanteAprovado: 7000, ...base },
      { estado: 'RECEBIDA', montanteAprovado: 99999, ...base },
    ] as never[];
    expect(totalFaturado(faturas)).toBe(15000);
  });
});

describe('prazos (RN-202/203/204)', () => {
  const contrato = {
    dataInicioVigencia: '2024-01-01',
    dataTerminoContratual: '2027-06-01',
  } as unknown as Contrato;

  it('deteta vigência acima de 36 meses', () => {
    expect(excedeLimiteVigencia(contrato)).toBe(true);
    const curto = { dataInicioVigencia: '2024-01-01', dataTerminoContratual: '2026-06-01' } as Contrato;
    expect(excedeLimiteVigencia(curto)).toBe(false);
  });

  it('fim efetivo é o primeiro entre término e esgotamento', () => {
    expect(fimEfetivoVigencia(contrato)).toBe('2027-06-01');
    expect(fimEfetivoVigencia(contrato, '2026-01-01')).toBe('2026-01-01');
    expect(fimEfetivoVigencia(contrato, '2028-01-01')).toBe('2027-06-01');
  });

  it('término de execução deslocado pelas suspensões que suspendem execução', () => {
    const alt: Alteracao[] = [
      {
        id: 'a', contratoId: 'c1', tipo: 'SUSPENSAO', dataEfeito: '2025-01-01',
        descricao: 'x', fundamentacao: 'y',
        suspensao: { dataInicio: '2025-01-01', dataFim: '2025-01-31', suspendePrazoExecucao: true },
        registadoEm: '2025-01-01T00:00:00.000Z', registadoPor: 'u1',
        atualizadoEm: '2025-01-01T00:00:00.000Z', atualizadoPor: 'u1',
      },
    ];
    const c = { dataTerminoContratual: '2026-06-01' } as Contrato;
    expect(terminoExecucaoAjustado(c, alt)).toBe('2026-07-01'); // +30 dias
  });
});
