import type { ReactNode } from "react";
import { ChatShell } from "@/components/chat-shell";

export const instant = false;

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatShell>{children}</ChatShell>;
}
