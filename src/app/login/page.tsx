import { Sticker } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="relative w-full max-w-sm rounded-[18px] border-2 border-outline bg-card p-6">
        <Sticker className="absolute -top-3 right-5" tilt={6}>
          Private
        </Sticker>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Listening Tracker</h1>
        <p className="mt-1 text-sm text-muted">Enter your password to see your charts.</p>
        <LoginForm />
      </div>
    </main>
  );
}
