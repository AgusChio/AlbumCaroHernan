import { useRef, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Album } from "../config";
import { prepareImage } from "../lib/images";
import { GoogleButton } from "./GoogleButton";

interface UploaderProps {
  album: Album;
  albumLabel: string;
  canUpload: boolean;
}

interface Progress {
  done: number;
  total: number;
  failed: number;
}

const CONCURRENCY = 2;

export function Uploader({ album, albumLabel, canUpload }: UploaderProps) {
  const { isAuthenticated } = useConvexAuth();
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const save = useMutation(api.photos.save);
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const post = async (blob: Blob) => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (!res.ok) throw new Error("upload failed");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };

  const uploadOne = async (file: File, target: Album) => {
    const img = await prepareImage(file);
    const [storageId, thumbId] = await Promise.all([
      post(img.full),
      img.thumb ? post(img.thumb) : Promise.resolve(undefined),
    ]);
    await save({ album: target, storageId, thumbId, width: img.width, height: img.height });
  };

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (input.current) input.current.value = "";
    if (files.length === 0) return;
    const target = album;
    const state: Progress = { done: 0, total: files.length, failed: 0 };
    let lastError: string | null = null;
    setMessage(null);
    setProgress({ ...state });

    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          await uploadOne(f, target);
        } catch (err) {
          state.failed++;
          if (err instanceof ConvexError) lastError = String(err.data);
        }
        state.done++;
        setProgress({ ...state });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setProgress(null);
    const ok = state.total - state.failed;
    setMessage(
      state.failed === 0
        ? `¡Listo! ${ok === 1 ? "Se subió 1 foto" : `Se subieron ${ok} fotos`}. Gracias ♡`
        : `Se subieron ${ok} de ${state.total}. ${lastError ?? "Probá de nuevo con las que faltan."}`,
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="uploader">
        <p>Ingresá con tu cuenta de Google para sumar tus fotos.</p>
        <GoogleButton />
      </div>
    );
  }

  return (
    <div className="uploader">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      {progress ? (
        <div className="progress" aria-live="polite">
          <span>
            Subiendo {progress.done} de {progress.total}…
          </span>
          <div className="bar">
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          <p>
            Sumá tus fotos a <em>{albumLabel}</em>. Podés elegir varias a la vez.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canUpload}
            onClick={() => input.current?.click()}
          >
            Subir fotos
          </button>
        </>
      )}
      {message && (
        <p className="upload-message" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
