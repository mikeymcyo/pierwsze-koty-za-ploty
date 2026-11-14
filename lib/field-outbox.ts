// Originals and the report binding commit together before any network operation.
// ArrayBuffers work in WebKit versions which cannot clone a MediaRecorder Blob.
export type FieldDraft = {
  id: string;
  scope: string;
  projectId: string;
  projectName: string;
  reportId?: string;
  day: string;
  at: string;
  photos: string[];
  attached: string[];
  text: string;
  hasAudio: boolean;
};
type Bytes = { id: string; data: ArrayBuffer; type: string };

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("siteboss-field-captures", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("drafts", { keyPath: "id" }).createIndex("scope", "scope");
      req.result.createObjectStore("media", { keyPath: "id" });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function transact<T>(write: boolean, operation: (tx: IDBTransaction) => IDBRequest<T>) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["drafts", "media"], write ? "readwrite" : "readonly");
      const result = operation(tx);
      tx.oncomplete = () => resolve(result.result);
      tx.onabort = () => reject(tx.error ?? new Error("The phone could not save the capture."));
    });
  } finally {
    db.close();
  }
}

export function listFieldDrafts(scope: string): Promise<FieldDraft[]> {
  return transact(false, tx => tx.objectStore("drafts").index("scope").getAll(scope));
}

// Queue updates per capture so a delayed checkpoint cannot replace the finished recording.
const writes = new Map<string, Promise<unknown>>();
export function keepFieldDraft(draft: FieldDraft, media: { id: string; blob: Blob }[] = []) {
  const snapshot = structuredClone(draft);
  const save = (writes.get(draft.id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const assets = await Promise.all(media.map(async ({ id, blob }) => ({
      id, data: await blob.arrayBuffer(), type: blob.type,
    })));
    await transact(true, tx => {
      for (const asset of assets) tx.objectStore("media").put(asset);
      return tx.objectStore("drafts").put(snapshot);
    });
  });
  writes.set(draft.id, save);
  void save.finally(() => { if (writes.get(draft.id) === save) writes.delete(draft.id); }).catch(() => {});
  return save;
}

export async function readFieldMedia(id: string): Promise<Blob> {
  const row: Bytes | undefined = await transact(false, tx => tx.objectStore("media").get(id));
  if (!row) throw new Error("The original media could not be read from this phone.");
  return new Blob([row.data], { type: row.type });
}

export async function removeFieldDraft(draft: FieldDraft) {
  await writes.get(draft.id);
  await transact(true, tx => {
    const media = tx.objectStore("media");
    for (const id of [...draft.photos, draft.id]) media.delete(id);
    return tx.objectStore("drafts").delete(draft.id);
  });
}
