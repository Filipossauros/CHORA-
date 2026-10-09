import { type ReactNode } from 'react';
import { UTILIZADORES } from '../porta/aplicacao-local.js';

/**
 * ENTRADA — a única página sem menu.
 *
 * Um botão, e mais nada. Não há campo de utilizador nem palavra-passe porque
 * não vai haver: quem autentica é o Entra ID da organização. Desenhar campos
 * agora seria desenhar um ecrã para depois o desfazer.
 *
 * As pastilhas por baixo são ANDAIME e estão declaradas como tal. Sem elas não
 * haveria como ver a aplicação pelos olhos de quem não é gestor — e é
 * precisamente aí que as restrições de papel se veem. Saem no dia em que o
 * Entra ID entrar.
 */
export function Login({ onEntrar }: { onEntrar: (utilizadorId: string) => void }): ReactNode {
  const gestor = UTILIZADORES.find((u) => u.papeis.includes('GESTOR_CONTRATO')) ?? UTILIZADORES[0]!;

  return (
    <div className="entrada">
      <div className="cartao-login">
        {/*
          Sem ilustração, o nome fica sozinho a carregar a marca — e por isso
          aparece ao tamanho a que foi desenhado, não como ícone de canto.
        */}
        <div className="marca-topo">
          <div className="logo">C+</div>
          <b>CHORA+</b>
        </div>

        <h1>Entrar no CHORA+</h1>
        <div className="sub">
          A autenticação é a da sua organização.<br />
          Não há palavra-passe própria nem conta a criar.
        </div>

        <button className="btn pri btn-entrar" onClick={() => onEntrar(gestor.id)}>
          <span className="ms" aria-hidden="true">
            <i style={{ background: '#F25022' }} /><i style={{ background: '#7FBA00' }} />
            <i style={{ background: '#00A4EF' }} /><i style={{ background: '#FFB900' }} />
          </span>
          Entrar com a conta da organização
        </button>

        <div className="rodape-login">
          Os seus papéis vêm do que estiver atribuído no CHORA+, não do Azure.
        </div>

        <div className="separa">Protótipo</div>
        <div className="perfis">
          {UTILIZADORES.map((u) => (
            <button key={u.id} className="fchip" onClick={() => onEntrar(u.id)}>{u.nome}</button>
          ))}
        </div>
        <div className="rodape-login">
          A ligação ao Entra ID ainda não está feita: o botão entra sempre como
          <b> {gestor.nome}</b>. Estas pastilhas escolhem outro papel, para se
          poderem ver os percursos de quem não gere.
        </div>
      </div>
    </div>
  );
}
