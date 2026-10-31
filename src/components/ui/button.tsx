import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean; variant?: "default" | "outline" };

export function Button({ asChild = false, variant = "default", className, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:pointer-events-none disabled:opacity-50", variant === "default" ? "bg-teal-800 text-white hover:bg-teal-900" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50", className)} {...props} />;
}
