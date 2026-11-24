// Contrato entre el backoffice (host) y el editor (microfrontend).
// Cualquier cambio aquí se cambia también en apps/backoffice/src/editor-host.ts.

/** Del backoffice al editor */
export type HostMessage =
  | { type: 'teatralia:load'; source: string; fileName: string }
  | { type: 'teatralia:theme'; theme: 'light' | 'dark' };

/** Del editor al backoffice */
export type EditorMessage =
  | { type: 'teatralia:ready' }
  | { type: 'teatralia:change'; source: string }
  | { type: 'teatralia:save'; source: string };

export function isHostMessage(data: unknown): data is HostMessage {
  return typeof data === 'object' && data !== null && String((data as { type?: unknown }).type).startsWith('teatralia:');
}
