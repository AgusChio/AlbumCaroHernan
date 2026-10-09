import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ALBUMS, type Album } from "../config";
import { Uploader } from "./Uploader";
import { Lightbox, type Photo } from "./Lightbox";

interface GalleryProps {
  canUpload: boolean;
  onOverlayChange: (open: boolean) => void;
}

const PAGE = 24;

export function Gallery({ canUpload, onOverlayChange }: GalleryProps) {
  const [album, setAlbum] = useState<Album>("iglesia");
  const [open, setOpen] = useState<number | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.photos.list,
    { album },
    { initialNumItems: PAGE },
  );
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOverlayChange(open !== null);
  }, [open, onOverlayChange]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && loadMore(PAGE),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  const photos = results as Photo[];
  const albumLabel = ALBUMS.find((a) => a.id === album)!.label;

  return (
    <section id="galeria" className="gallery">
      <div className="gallery-head">
        <h2>Galería</h2>
        <div className="tabs" role="tablist" aria-label="Álbumes">
          {ALBUMS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={album === a.id}
              className={`tab ${album === a.id ? "is-active" : ""}`}
              onClick={() => {
                setAlbum(a.id);
                setOpen(null);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <Uploader album={album} albumLabel={albumLabel} canUpload={canUpload} />

      {status === "LoadingFirstPage" ? (
        <p className="empty">Cargando fotos…</p>
      ) : photos.length === 0 ? (
        <p className="empty">Todavía no hay fotos de {albumLabel.toLowerCase()}. ¡Subí la primera!</p>
      ) : (
        <div className="grid">
          {photos.map((p, i) => (
            <button
              key={p._id}
              className="tile"
              style={{ aspectRatio: `${p.width} / ${p.height}` }}
              onClick={() => setOpen(i)}
              aria-label={`Foto de ${p.uploaderName}`}
            >
              <img
                src={p.thumbUrl ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
              />
            </button>
          ))}
        </div>
      )}
      <div ref={sentinel} />
      {status === "LoadingMore" && <p className="empty">Cargando más…</p>}

      {open !== null && photos[open] && (
        <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
