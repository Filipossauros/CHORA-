import * as XLSX from 'xlsx';

export interface ParametrosProjecao {
  contratoNumero: string;
  perfilNome: string;
  horasDisponiveis: number; // horas
  valorDisponivel: number; // cêntimos
  horasMesPorFTE?: number; // por omissão 160 h/mês
  fte?: number; // pessoas a tempo inteiro consideradas
}

export interface LinhaProjecao {
  mes: string;
  horasMes: number;
  horasAcumuladas: number;
  horasRestantes: number;
  valorConsumidoAcum: number; // €
  valorRestante: number; // €
}

/** Constrói a projeção mensal de consumo do saldo do perfil (determinística). */
export function calcularProjecao(p: ParametrosProjecao): LinhaProjecao[] {
  const horasMes = (p.horasMesPorFTE ?? 160) * (p.fte ?? 1);
  const linhas: LinhaProjecao[] = [];
  const hoje = new Date();
  let hAcum = 0;
  for (let m = 1; m <= 24 && hAcum < p.horasDisponiveis && horasMes > 0; m += 1) {
    const hMes = Math.min(horasMes, p.horasDisponiveis - hAcum);
    hAcum += hMes;
    const d = new Date(hoje); d.setMonth(d.getMonth() + m);
    const fracao = p.horasDisponiveis > 0 ? hAcum / p.horasDisponiveis : 0;
    const valorConsumido = p.valorDisponivel * fracao;
    linhas.push({
      mes: d.toISOString().slice(0, 7),
      horasMes: hMes,
      horasAcumuladas: hAcum,
      horasRestantes: Math.max(0, p.horasDisponiveis - hAcum),
      valorConsumidoAcum: +(valorConsumido / 100).toFixed(2),
      valorRestante: +((p.valorDisponivel - valorConsumido) / 100).toFixed(2),
    });
  }
  return linhas;
}

/** Gera e descarrega o mapa de projeção em Excel (.xlsx) com folhas de resumo e detalhe. */
export function gerarMapaProjecaoXlsx(p: ParametrosProjecao): void {
  const linhas = calcularProjecao(p);
  const horasMes = (p.horasMesPorFTE ?? 160) * (p.fte ?? 1);
  const resumo = [
    ['CHORA+ · Mapa de projeção de mobilização'],
    [],
    ['Contrato alternativo', p.contratoNumero],
    ['Perfil idêntico', p.perfilNome],
    ['Horas disponíveis', p.horasDisponiveis],
    ['Valor disponível (€)', +(p.valorDisponivel / 100).toFixed(2)],
    ['Pessoas a tempo inteiro (FTE)', p.fte ?? 1],
    ['Horas/mês por FTE', p.horasMesPorFTE ?? 160],
    ['Horas/mês consideradas', horasMes],
    ['Meses de autonomia (estimados)', linhas.length],
    ['Gerado em', new Date().toISOString().slice(0, 10)],
    [],
    ['Nota', 'Projeção determinística e indicativa. A mobilização entre contratos deve observar os requisitos contratuais e legais aplicáveis (CCP).'],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo['!cols'] = [{ wch: 32 }, { wch: 60 }];

  const wsDetalhe = XLSX.utils.json_to_sheet(linhas.map((l) => ({
    'Mês': l.mes,
    'Horas no mês': l.horasMes,
    'Horas acumuladas': l.horasAcumuladas,
    'Horas restantes': l.horasRestantes,
    'Valor consumido acum. (€)': l.valorConsumidoAcum,
    'Valor restante (€)': l.valorRestante,
  })));
  wsDetalhe['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, wsDetalhe, 'Projeção mensal');
  XLSX.writeFile(wb, `projecao-${p.contratoNumero}-${p.perfilNome.replace(/\s+/g, '-')}.xlsx`);
}
