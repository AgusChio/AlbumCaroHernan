import { useRef, useState, type CSSProperties } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import TreeHero, { pickTreeSeed } from "./tree/TreeHero";
import { phoneAspect } from "./tree/seeds";
import { Nav } from "./components/Nav";
import { Gallery } from "./components/Gallery";
import { ProfileModal } from "./components/ProfileModal";
import { WEDDING } from "./config";

const NAV_HEIGHT = 64;
const GROUND = 56;

export default function App() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.profiles.me, isAuthenticated ? {} : "skip");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const copyRef = useRef<HTMLDivElement>(null);
  const [treeSeed] = useState(pickTreeSeed);
  const needsProfile = isAuthenticated && me != null && me.profile === null;

  return (
    <>
      <Nav me={me ?? null} />

      <header className="hero" style={{ "--tree-aspect": phoneAspect(treeSeed) } as CSSProperties}>
        <TreeHero
          seed={treeSeed}
          paused={overlayOpen || needsProfile}
          navHeight={NAV_HEIGHT}
          ground={GROUND}
          avoid={copyRef}
        />
        <div className="hero-copy">
          <div ref={copyRef} className="hero-copy-text">
            <p className="eyebrow">Nuestra boda</p>
            <h1>{WEDDING.couple}</h1>
            <p className="hero-date">{WEDDING.date}</p>
            <p className="hero-text">{WEDDING.invitation}</p>
          </div>
          <a className="btn btn-primary" href="#galeria">
            Ver la galería
          </a>
        </div>
        <div className="hero-ground" />
      </header>

      <Gallery canUpload={Boolean(me?.profile)} onOverlayChange={setOverlayOpen} />

      <footer className="footer">
        <span className="monogram">{WEDDING.monogram}</span>
        <p>Hecho con amor para compartir este día.</p>
        <nav className="footer-links" aria-label="Información legal">
          <a href={`${import.meta.env.BASE_URL}privacidad.html`}>Política de privacidad</a>
          <a href={`${import.meta.env.BASE_URL}condiciones.html`}>Condiciones de uso</a>
        </nav>
      </footer>

      {needsProfile && <ProfileModal googleName={me.googleName} />}
    </>
  );
}
