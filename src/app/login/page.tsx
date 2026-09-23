import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Sign in — Brain", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className={styles.root}>
      <div className={styles.glow} aria-hidden />
      <LoginForm />
    </main>
  );
}
