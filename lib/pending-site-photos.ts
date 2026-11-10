import type { PhotoCategory } from "@/types/database";

export type PendingUpload = {
  category: PhotoCategory;
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  path: string;
  thumb: Blob | null;
};

// Resolve only after the transaction commits, including the photo bytes.
async function photoRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("siteboss-pending-site-photos", 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore("photos", { keyPath: ["scope", "id"] });
      store.createIndex("scope", "scope");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("photos", mode);
      const request = run(tx.objectStore("photos"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("Photo storage unavailable"));
    });
  } finally {
    db.close();
  }
}

type StoredPhoto = Omit<PendingUpload, "blob" | "thumb"> & {
  blob: ArrayBuffer;
  thumb: ArrayBuffer | null;
  mime: string;
};

export async function keepPendingPhoto(scope: string, photo: PendingUpload) {
  const [blob, thumb] = await Promise.all([photo.blob.arrayBuffer(), photo.thumb?.arrayBuffer() ?? null]);
  return photoRequest("readwrite", store => store.put({ ...photo, scope, blob, thumb, mime: photo.blob.type }));
}

export async function pendingPhotos(scope: string): Promise<PendingUpload[]> {
  const rows: StoredPhoto[] = await photoRequest("readonly", store => store.index("scope").getAll(scope));
  return rows.map(({ blob, mime, thumb, ...photo }) => ({
    ...photo,
    blob: new Blob([blob], { type: mime }),
    thumb: thumb && new Blob([thumb], { type: "image/jpeg" }),
  }));
}

export function removePendingPhoto(scope: string, id: string) {
  return photoRequest("readwrite", store => store.delete([scope, id]));
}
