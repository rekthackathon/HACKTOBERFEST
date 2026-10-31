import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
 
type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean; variant?: "default" | "outline" };
 
export function Button({ asChild = false, variant = "default", className, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2 text-sm font-semibold transition-[background-color,transform] duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:pointer-events-none disabled:opacity-50", variant === "default" ? "bg-teal-800 text-white hover:bg-teal-900" : "border border-slate-400 bg-white text-slate-900 hover:bg-slate-50", className)} {...props} />;
}
 