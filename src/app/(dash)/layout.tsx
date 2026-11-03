import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "../actions";

export default function DashLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-6 pb-2">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">
          Listening Tracker
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-4">
          <ThemeToggle />
          <form action={logout}>
            <button type="submit" className="text-sm text-muted hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-12">{children}</main>
    </>
  );
}
