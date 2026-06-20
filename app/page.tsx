import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ContextMenuProvider } from "@/components/ContextMenuProvider";

export default function Home() {
  return (
    <ContextMenuProvider>
      <Suspense>
        <AppShell />
      </Suspense>
    </ContextMenuProvider>
  );
}
