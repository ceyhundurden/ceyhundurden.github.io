"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken, GitHubBackend, GITHUB, setToken } from "@/lib/backend";
import styles from "./login.module.css";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export default function LoginForm() {
  const [token, setTokenValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // already signed in → straight to the map
  useEffect(() => {
    if (getToken()) window.location.replace("/");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await new GitHubBackend(t).verify();
      setToken(t);
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error && err.message ? `${err.message[0].toLocaleUpperCase("tr")}${err.message.slice(1)}.` : "Doğrulanamadı.");
      setBusy(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={submit}>
      <div className={styles.brand}>
        <span className={styles.dot} />
        brain
      </div>
      <h1 className={styles.title}>Yönetici girişi</h1>
      <p className={styles.sub}>Düzenleme için bu repoya yazabilen bir GitHub token&apos;ı gir.</p>
      <ol className={styles.steps}>
        <li>
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener noreferrer">
            Yeni fine-grained token oluştur ↗
          </a>
        </li>
        <li>
          <b>Repository access</b> → <b>Only select repositories</b> → <code>{GITHUB.repo}</code>
        </li>
        <li>
          <b>Permissions</b> → <b>Contents</b>: <b>Read and write</b>
        </li>
        <li>Oluşan token&apos;ı kopyalayıp aşağıya yapıştır.</li>
      </ol>
      <input
        className={styles.input}
        type="password"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="github_pat_…"
        value={token}
        onChange={(e) => setTokenValue(e.target.value)}
        aria-label="GitHub token"
        aria-invalid={!!error}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.button} type="submit" disabled={busy || !token.trim()}>
        {busy ? "Doğrulanıyor…" : "Giriş yap"}
      </button>
      <p className={styles.note}>Token yalnızca bu tarayıcıda saklanır; çıkış yapınca silinir.</p>
      <Link href="/" className={styles.back}>
        ← Haritaya dön
      </Link>
    </form>
  );
}
