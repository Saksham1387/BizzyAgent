import type { HTMLAttributes } from "react";

export function SidebarFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col gap-2 p-2 ${className}`}
      data-sidebar="footer"
      {...props}
    />
  );
}
