import type { Afetacao, PerfilContratual, RegistoTempo } from '@chora/domain';

/** Dias úteis (seg–sex) no intervalo (deExclusivo, ateInclusivo]. */
export function diasUteis(deExclusivo: string, ateInclusivo: string): number {
  const d = new Date(`${deExclusivo}T00:00:00`);
  const fim = new Date(`${ateInclusivo}T00:00:00`);
  let n = 0;
  d.setDate(d.getDate() + 1);
  while (d <= fim) {
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export interface LinhaCapacidade {
  perfilId: string;
  nome: string;
  restantesH: number;
  afetas: number;
  alvo: number;
  alvoTeto: number;
  emFalta: number;
}

export interface CapacidadeContrato {
  dias: number;
  capacidadePessoaH: number;
  linhas: LinhaCapacidade[];
  totalAfetas: number;
  totalAlvo: number;
  totalFalta: number;
  algumInfinito: boolean;
}

/**
 * Estima a afetação-alvo de um contrato chave-na-mão: pessoas a tempo inteiro
 * (8 h/dia × 5 dias/semana) necessárias para consumir as horas por perfil que
 * faltam, no tempo útil que resta até ao término. Alvo teórico (sem feriados,
 * férias, faltas ou ramp-up).
 */
export function calcularCapacidade(
  termino: string,
  hojeStr: string,
  perfis: PerfilContratual[],
  afetacoes: Afetacao[],
  aprovados: RegistoTempo[],
): CapacidadeContrato {
  const dias = diasUteis(hojeStr, termino);
  const capacidadePessoaH = 8 * dias;

  const linhas: LinhaCapacidade[] = perfis.map((p) => {
    const contratadasH = p.quantidadePrevista / 60;
    const consumidasMin = aprovados.filter((r) => r.perfilId === p.id).reduce((s, r) => s + r.duracao, 0);
    const restantesH = Math.max(0, contratadasH - consumidasMin / 60);
    const afetas = new Set(afetacoes.filter((a) => a.ativa && a.perfilId === p.id).map((a) => a.recursoId)).size;
    const alvo = capacidadePessoaH > 0 ? restantesH / capacidadePessoaH : (restantesH > 0 ? Infinity : 0);
    const alvoTeto = Number.isFinite(alvo) ? Math.ceil(alvo) : Infinity;
    const emFalta = Number.isFinite(alvoTeto) ? Math.max(0, alvoTeto - afetas) : Infinity;
    return { perfilId: p.id, nome: p.nome, restantesH, afetas, alvo, alvoTeto, emFalta };
  });

  return {
    dias,
    capacidadePessoaH,
    linhas,
    totalAfetas: linhas.reduce((s, l) => s + l.afetas, 0),
    totalAlvo: linhas.reduce((s, l) => s + (Number.isFinite(l.alvoTeto) ? l.alvoTeto : 0), 0),
    totalFalta: linhas.reduce((s, l) => s + (Number.isFinite(l.emFalta) ? l.emFalta : 0), 0),
    algumInfinito: linhas.some((l) => !Number.isFinite(l.emFalta)),
  };
}
