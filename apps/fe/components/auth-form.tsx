"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthFormProps = {
  mode: "signin" | "signup";
};

export function AuthForm({ mode }: AuthFormProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiFetch<{ user: User }>(
        isSignup ? "/auth/signup" : "/auth/signin",
        {
          method: "POST",
          body: JSON.stringify(
            isSignup ? { name, email, password } : { email, password },
          ),
        },
      );

      setUser(data.user);
      router.replace("/chat");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image
            alt="Bizzy logo"
            className="h-10 w-10 rounded-xl bg-black object-contain"
            height={1254}
            priority
            sizes="40px"
            src="/bizzy-logo.png"
            width={1254}
          />
          <div>
            <p className="text-base font-semibold tracking-tight text-zinc-900">
              Bizzy
            </p>
            <p className="text-xs text-zinc-500">Cloud coding agent</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isSignup
              ? "Start building with an agent that works in your repos."
              : "Sign in to continue to your conversations."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {isSignup ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Name
                </span>
                <input
                  autoComplete="name"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                  type="text"
                  value={name}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                Email
              </span>
              <input
                autoComplete="email"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-zinc-700">
                Password
              </span>
              <input
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              className="w-full rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting
                ? isSignup
                  ? "Creating account..."
                  : "Signing in..."
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-zinc-500">
          {isSignup ? "Already have an account?" : "New to Bizzy?"}{" "}
          <Link
            className="font-medium text-zinc-900 underline-offset-4 hover:underline"
            href={isSignup ? "/signin" : "/signup"}
          >
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
