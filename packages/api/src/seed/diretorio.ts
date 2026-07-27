import type { Diretorio } from '../contexto.js';

/**
 * Diretório de pessoas do workspace (Entra ID), simulado.
 *
 * As pessoas não se criam na aplicação: herdam-se do diretório da organização.
 * Sem isto, o assistente só poderia falar em `oid-recurso-02` — e ninguém pede
 * uma substituição por identificador.
 */
export const PESSOAS: ReadonlyArray<{ id: string; nome: string; prestador?: string }> = [
  { id: 'oid-gestor-contrato', nome: 'Ana Gestora (Contraente)' },
  { id: 'oid-gestor-tecnico', nome: 'Bruno Técnico (Contraente)' },
  { id: 'oid-recurso-01', nome: 'Carla Andrade', prestador: 'Prestador Alfa, Lda.' },
  { id: 'oid-recurso-02', nome: 'Diogo Marques', prestador: 'Prestador Alfa, Lda.' },
  { id: 'oid-recurso-03', nome: 'Eva Nogueira', prestador: 'Subcontratado Beta, S.A.' },
  { id: 'oid-recurso-09', nome: 'Filipe Costa', prestador: 'Prestador Alfa, Lda.' },
];

const normalizar = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Correspondência tolerante: nome completo, primeiro e último, ou apelido
 * isolado quando não é ambíguo. Ambiguidade não se resolve aqui — devolvem-se
 * todos os candidatos e quem chamou decide se pergunta.
 */
export const DIRETORIO_SEED: Diretorio = {
  nome: (id) => PESSOAS.find((p) => p.id === id)?.nome,
  procurar: (texto) => {
    const alvo = normalizar(texto);
    if (alvo.length < 3) return [];
    const exatos = PESSOAS.filter((p) => normalizar(p.nome) === alvo);
    if (exatos.length > 0) return exatos.map(({ id, nome }) => ({ id, nome }));
    return PESSOAS
      .filter((p) => {
        const n = normalizar(p.nome);
        if (n.includes(alvo)) return true;
        const partes = alvo.split(' ');
        return partes.length > 1 && partes.every((parte) => n.includes(parte));
      })
      .map(({ id, nome }) => ({ id, nome }));
  },
};
