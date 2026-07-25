import type { EstadoContrato } from '../enums/index.js';
import type { DataISO } from '../tipos/primitivos.js';
import { conforme, violada, type Regra } from '../erros/regra.js';
import {
  LIMITE_VIGENCIA_MESES,
  suspensoesSobrepoem,
  type PeriodoSuspensao,
} from '../calculos/prazos.js';
import { mesesEntre } from '../tipos/tempo.js';
import { bloqueiaRegisto } from './_comum.js';

/** RN-201 — dataInicioVigencia < dataTerminoContratual. */
export const RN_201: Regra<{ dataInicioVigencia: DataISO; dataTerminoContratual: DataISO }> = {
  codigo: 'RN-201',
  descricao: 'dataInicioVigencia < dataTerminoContratual.',
  requisito: 'RF11',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ dataInicioVigencia, dataTerminoContratual }) {
    if (dataInicioVigencia >= dataTerminoContratual) {
      return violada('A data de início de vigência tem de ser anterior à data de término.', {
        dataInicioVigencia,
        dataTerminoContratual,
      });
    }
    return conforme;
  },
};

/** RN-202 — vigência não deve exceder 36 meses. Exceção fundamentável (ADR-10). */
export const RN_202: Regra<{
  dataInicioVigencia: DataISO;
  dataTerminoContratual: DataISO;
  temExcecao: boolean;
}> = {
  codigo: 'RN-202',
  descricao:
    'A vigência do contrato, incluindo prorrogações, não deve exceder 36 meses. Exceção fundamentável.',
  requisito: 'RF10',
  base: 'CCP, art. 440.º e 48.º — admite-se prazo superior mediante fundamentação (ADR-10).',
  excecaoFundamentavel: true,
  avaliar({ dataInicioVigencia, dataTerminoContratual, temExcecao }) {
    const meses = mesesEntre(dataInicioVigencia, dataTerminoContratual);
    if (meses > LIMITE_VIGENCIA_MESES && !temExcecao) {
      return violada(
        `A vigência de ${meses.toFixed(1)} meses excede o limite de ${LIMITE_VIGENCIA_MESES} meses. Requer exceção fundamentada.`,
        { meses, limite: LIMITE_VIGENCIA_MESES },
      );
    }
    return conforme;
  },
};

/**
 * RN-203 — a vigência conta desde dataInicioVigencia até ao primeiro de
 * dataTerminoContratual ou o esgotamento das horas/valor. Regra definicional:
 * valida que o fim efetivo declarado não é posterior ao término contratual.
 */
export const RN_203: Regra<{
  dataTerminoContratual: DataISO;
  fimEfetivoDeclarado: DataISO;
}> = {
  codigo: 'RN-203',
  descricao:
    'A vigência conta desde dataInicioVigencia até ao primeiro de: dataTerminoContratual; ou o esgotamento das horas/valor disponíveis.',
  requisito: 'RF11',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ dataTerminoContratual, fimEfetivoDeclarado }) {
    if (fimEfetivoDeclarado > dataTerminoContratual) {
      return violada(
        'O fim efetivo de vigência não pode ser posterior à data de término contratual.',
        { dataTerminoContratual, fimEfetivoDeclarado },
      );
    }
    return conforme;
  },
};

/** RN-204 — deslocação da vigência por suspensão além de 36 meses exige exceção (aviso). */
export const RN_204: Regra<{ vigenciaProjetadaMeses: number; temExcecao: boolean }> = {
  codigo: 'RN-204',
  descricao:
    'Suspensões que deslocam a execução podem empurrar a vigência além dos 36 meses; nesse caso, aviso e exceção fundamentada.',
  requisito: 'RF11.3 (corrigido)',
  base: 'Separar prazo de vigência de prazo de execução.',
  excecaoFundamentavel: true,
  bloqueia: false,
  avaliar({ vigenciaProjetadaMeses, temExcecao }) {
    if (vigenciaProjetadaMeses > LIMITE_VIGENCIA_MESES && !temExcecao) {
      return violada(
        'A deslocação por suspensão empurra a vigência projetada para além dos 36 meses.',
        { vigenciaProjetadaMeses, limite: LIMITE_VIGENCIA_MESES },
      );
    }
    return conforme;
  },
};

/** RN-205 — períodos de suspensão não se podem sobrepor. */
export const RN_205: Regra<{ suspensoes: ReadonlyArray<PeriodoSuspensao> }> = {
  codigo: 'RN-205',
  descricao: 'Períodos de suspensão não se podem sobrepor entre si.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ suspensoes }) {
    for (let i = 0; i < suspensoes.length; i += 1) {
      for (let j = i + 1; j < suspensoes.length; j += 1) {
        const a = suspensoes[i];
        const b = suspensoes[j];
        if (a !== undefined && b !== undefined && suspensoesSobrepoem(a, b)) {
          return violada('Há períodos de suspensão sobrepostos.', {
            a: a.dataInicio,
            b: b.dataInicio,
          });
        }
      }
    }
    return conforme;
  },
};

/** RN-207 — disponibilidade financeira não altera o limite temporal (invariante informativa). */
export const RN_207: Regra<{ tentaEstenderVigenciaPorSaldo: boolean }> = {
  codigo: 'RN-207',
  descricao: 'A existência de disponibilidade financeira não altera o limite temporal.',
  requisito: 'requisito sem número',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ tentaEstenderVigenciaPorSaldo }) {
    if (tentaEstenderVigenciaPorSaldo) {
      return violada(
        'A vigência não pode ser estendida com fundamento em saldo financeiro disponível.',
      );
    }
    return conforme;
  },
};

/** RN-208 — contratos RESOLVIDO/CADUCADO/REVOGADO/TERMINADO bloqueiam registo e aprovação. */
export const RN_208: Regra<{ estado: EstadoContrato }> = {
  codigo: 'RN-208',
  descricao:
    'Contratos em estado RESOLVIDO, CADUCADO, REVOGADO ou TERMINADO bloqueiam qualquer novo registo ou aprovação.',
  requisito: 'novo',
  base: 'O documento original só previa termo natural.',
  excecaoFundamentavel: false,
  avaliar({ estado }) {
    if (bloqueiaRegisto(estado)) {
      return violada(`O estado do contrato (${estado}) bloqueia novos registos ou aprovações.`, {
        estado,
      });
    }
    return conforme;
  },
};

export const REGRAS_PRAZOS = [
  RN_201,
  RN_202,
  RN_203,
  RN_204,
  RN_205,
  RN_207,
  RN_208,
] as const;
