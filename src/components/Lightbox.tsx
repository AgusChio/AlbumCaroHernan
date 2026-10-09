import { useEffect, useRef } from "react";

const SWIPE_PX = 50;

export interface Photo {
  _id: string;
  _creationTime: number;
  width: number;
  height: number;
  uploaderName: string;
  url: string | null;
  thumbUrl: string | null;
}

interface LightboxProps {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}

const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

export function Lightbox({ photos, index, onIndex, onClose }: LightboxProps) {
  const photo = photos[index];
  const prev = index > 0 ? () => onIndex(index - 1) : null;
  const next = index < photos.length - 1 ? () => onIndex(index + 1) : null;
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev?.();
      else if (e.key === "ArrowRight") next?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(t.clientY - start.y)) return;
        if (dx < 0) next?.();
        else prev?.();
      }}
    >
      <button className="lb-close" aria-label="Cerrar" onClick={onClose}>
        ×
      </button>
      {prev && (
        <button className="lb-nav lb-prev" aria-label="Anterior" onClick={(e) => (e.stopPropagation(), prev())}>
          ‹
        </button>
      )}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.url ?? photo.thumbUrl ?? undefined} alt={`Foto de ${photo.uploaderName}`} />
        <figcaption>
          {photo.uploaderName} · {time.format(photo._creationTime)}
        </figcaption>
      </figure>
      {next && (
        <button className="lb-nav lb-next" aria-label="Siguiente" onClick={(e) => (e.stopPropagation(), next())}>
          ›
        </button>
      )}
    </div>
  );
}
