import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";

function splitName(full: string | null) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function ProfileModal({ googleName }: { googleName: string | null }) {
  const initial = splitName(googleName);
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useMutation(api.profiles.create);
  const { signOut } = useAuthActions();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await create({ firstName, lastName });
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "No pudimos guardar tus datos.");
      setSaving(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <form className="modal" onSubmit={submit}>
        <p className="eyebrow">Bienvenido/a</p>
        <h2 id="profile-title">¿Quién sos?</h2>
        <p className="modal-text">
          Solo te lo pedimos esta vez, así los novios saben quién subió cada foto.
        </p>
        <label className="field">
          <span>Nombre</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            maxLength={60}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Apellido</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            maxLength={60}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={saving}>
          {saving ? "Guardando…" : "Continuar"}
        </button>
        <button type="button" className="btn btn-link" onClick={() => void signOut()}>
          Usar otra cuenta
        </button>
      </form>
    </div>
  );
}
