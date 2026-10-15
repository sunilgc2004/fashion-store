import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [reg, setReg] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const [sp] = useSearchParams();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (!body.phone) delete body.phone;
    try {
      await api(reg ? "/auth/register" : "/auth/login", { body });
      onAuth();
      const next = sp.get("next");
      nav(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (x: any) { setErr(x.message); }
  }
  const input = "w-full rounded border p-2";
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      <h1 className="text-2xl font-semibold">{reg ? "Create account" : "Log in"}</h1>
      {reg && <input name="name" placeholder="Full name" required className={input} />}
      <input name="email" type="email" placeholder="Email" required className={input} />
      {reg && <input name="phone" placeholder="Mobile (optional)" className={input} />}
      <input name="password" type="password" placeholder="Password (min 8 characters)" required minLength={8} className={input} />
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button className="btn w-full">{reg ? "Register" : "Log in"}</button>
      <button type="button" onClick={() => setReg(!reg)} className="text-sm underline">{reg ? "I already have an account" : "New here? Create an account"}</button>
    </form>
  );
}
