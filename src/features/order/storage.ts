import type { Cart, Notes } from "./logic";

// Conveniências locais (não são fonte de verdade): preencher nome/celular e guardar rascunho do pedido.
const PROFILE = "pedeai:profile";
const draftKey = (roundId: string, participantId: string) =>
  `pedeai:draft:${roundId}:${participantId}`;

const notesKey = (roundId: string, participantId: string) =>
  `pedeai:draft-notes:${roundId}:${participantId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type Profile = { name: string; phone: string };
export const loadProfile = () => read<Profile>(PROFILE);
export const saveProfile = (p: Profile) => write(PROFILE, p);

export const loadDraft = (roundId: string, participantId: string) =>
  read<Cart>(draftKey(roundId, participantId));
export const saveDraft = (roundId: string, participantId: string, cart: Cart) =>
  write(draftKey(roundId, participantId), cart);
export const loadDraftNotes = (roundId: string, participantId: string) =>
  read<Notes>(notesKey(roundId, participantId));
export const saveDraftNotes = (roundId: string, participantId: string, notes: Notes) =>
  write(notesKey(roundId, participantId), notes);
export function clearDraft(roundId: string, participantId: string) {
  try {
    localStorage.removeItem(draftKey(roundId, participantId));
    localStorage.removeItem(notesKey(roundId, participantId));
  } catch {
    /* ignore */
  }
}
