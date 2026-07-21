import * as SDK from 'azure-devops-extension-sdk';
import { ClienteApi } from './comum/cliente-api.js';

/**
 * Inicialização do SDK do Azure DevOps (secção 10.1). Toda a interação com o
 * host passa pelo SDK; a UI corre num iframe sandboxed.
 */

const BASE_API = (globalThis as { CHORA_API_BASE?: string }).CHORA_API_BASE ?? 'http://localhost:7071';

export async function inicializar(): Promise<{ cliente: ClienteApi; utilizadorId: string; projetoId?: string }> {
  await SDK.init({ loaded: false });
  await SDK.ready();
  const contexto = SDK.getWebContext();
  const cliente = new ClienteApi({
    baseUrl: BASE_API,
    obterToken: () => SDK.getAccessToken(),
    ...(contexto.project?.id !== undefined ? { projetoId: contexto.project.id } : {}),
  });
  SDK.notifyLoadSucceeded();
  return {
    cliente,
    utilizadorId: SDK.getUser().id,
    ...(contexto.project?.id !== undefined ? { projetoId: contexto.project.id } : {}),
  };
}
