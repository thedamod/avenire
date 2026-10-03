"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Inbox, Search, Sun, Settings, Sparkles } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@avenire/ui/components/sheet";
import { RuthPanel } from "~/features/ruth/RuthPanel";

const links = [
  { href: "/", label: "Canvas", icon: BookOpen },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/search", label: "Search", icon: Search },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [ruthOpen, setRuthOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setRuthOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen min-h-0 bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
        <div className="flex h-14 items-center px-5 font-semibold">Avenire</div>
        <nav aria-label="Main navigation" className="grid gap-1 px-3">
          {links.map(({ href, label, icon: Icon }) => {
            const selected = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={selected ? "page" : undefined}
                className={`flex h-9 items-center gap-3 px-3 text-sm ${selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setRuthOpen(true)}
          >
            <Sparkles />
            Ask Ruth<span className="ml-auto text-xs text-muted-foreground">⌘J</span>
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      <Sheet open={ruthOpen} onOpenChange={setRuthOpen}>
        <SheetContent className="w-[min(32rem,100vw)] sm:max-w-lg p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Ruth</SheetTitle>
          </SheetHeader>
          <RuthPanel />
        </SheetContent>
      </Sheet>
    </div>
  );
}
