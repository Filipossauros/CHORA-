import type { DataISO } from '../tipos/primitivos.js';
import { conforme, violada, type Regra } from '../erros/regra.js';
import { adicionarDias, dentroDoIntervalo } from '../tipos/tempo.js';

/** RN-701 — substituição de recurso: nova afetação com substituiAfetacaoId; perfil e entidade coincidem. */
export const RN_701: Regra<{
  perfilAntigo: string;
  perfilNovo: string;
  entidadeAntiga: string;
  entidadeNova: string;
  encerraAnterior: boolean;
}> = {
  codigo: 'RN-701',
  descricao:
    'A substituição de um recurso cria nova afetação com substituiAfetacaoId, encerrando a anterior. Perfil e entidade executante têm de coincidir.',
  requisito: 'novo',
  base: 'Ponto de litígio frequente neste tipo de contrato.',
  excecaoFundamentavel: false,
  avaliar({ perfilAntigo, perfilNovo, entidadeAntiga, entidadeNova, encerraAnterior }) {
    if (perfilAntigo !== perfilNovo) {
      return violada('A substituição tem de manter o mesmo perfil.', { perfilAntigo, perfilNovo });
    }
    if (entidadeAntiga !== entidadeNova) {
      return violada('A substituição tem de manter a mesma entidade executante.', {
        entidadeAntiga,
        entidadeNova,
      });
    }
    if (!encerraAnterior) {
      return violada('A substituição tem de encerrar a afetação anterior.');
    }
    return conforme;
  },
};

/** RN-702 — a afetação identifica a entidade executante efetiva. */
export const RN_702: Regra<{ entidadeExecutanteNipc: string }> = {
  codigo: 'RN-702',
  descricao: 'A afetação identifica a entidade executante efetiva (adjudicatário ou subcontratado).',
  requisito: 'novo',
  base: 'CCP, art. 316.º e ss. e art. 321.º-A.',
  excecaoFundamentavel: false,
  avaliar({ entidadeExecutanteNipc }) {
    if (entidadeExecutanteNipc.trim().length === 0) {
      return violada('A afetação tem de identificar a entidade executante.');
    }
    return conforme;
  },
};

/** RN-703 — documentos de habilitação a expirar em < 30 dias geram alerta (aviso). */
export const RN_703: Regra<{ validoAte: DataISO; hoje: DataISO; limiarDias?: number }> = {
  codigo: 'RN-703',
  descricao:
    'Documentos de habilitação com validade a expirar em menos de 30 dias geram alerta ao gestor.',
  requisito: 'novo',
  base: 'Revalidação necessária, sobretudo em renovações.',
  excecaoFundamentavel: false,
  bloqueia: false,
  avaliar({ validoAte, hoje, limiarDias = 30 }) {
    const limiteISO = adicionarDias(hoje, limiarDias);
    if (validoAte <= limiteISO) {
      return violada('Documento de habilitação a expirar em breve.', { validoAte, hoje });
    }
    return conforme;
  },
};

/** Intervalo de tempo (minutos do dia) de um registo, para deteção de sobreposição. */
export interface IntervaloRegisto {
  data: DataISO;
  inicioMin: number;
  fimMin: number;
}

/** RN-704 — mesmo recurso pode estar em vários contratos, mas não registar tempo sobreposto. */
export const RN_704: Regra<{ existentes: ReadonlyArray<IntervaloRegisto>; novo: IntervaloRegisto }> = {
  codigo: 'RN-704',
  descricao:
    'Um mesmo recurso pode estar afeto a vários contratos, mas não pode registar tempo sobreposto.',
  requisito: 'novo',
  base: '—',
  excecaoFundamentavel: false,
  avaliar({ existentes, novo }) {
    const sobrepoe = existentes.some(
      (e) => e.data === novo.data && e.inicioMin < novo.fimMin && novo.inicioMin < e.fimMin,
    );
    if (sobrepoe) {
      return violada('O recurso já tem tempo registado que se sobrepõe a este período.', {
        data: novo.data,
      });
    }
    return conforme;
  },
};

// Utilitário auxiliar reexportado para conveniência dos serviços.
export { dentroDoIntervalo };

export const REGRAS_RECURSOS = [RN_701, RN_702, RN_703, RN_704] as const;
