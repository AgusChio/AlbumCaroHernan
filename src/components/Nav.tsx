import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { GoogleButton } from "./GoogleButton";
import { WEDDING } from "../config";

interface NavProps {
  me: { profile: { firstName: string } | null } | null;
}

export function Nav({ me }: NavProps) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  return (
    <nav className="nav">
      <a className="monogram" href="#">
        {WEDDING.monogram}
      </a>
      <div className="nav-actions">
        {isLoading ? null : isAuthenticated ? (
          <>
            {me?.profile && <span className="nav-hello">Hola, {me.profile.firstName}</span>}
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Salir
            </button>
          </>
        ) : (
          <GoogleButton label="Ingresar" />
        )}
      </div>
    </nav>
  );
}
