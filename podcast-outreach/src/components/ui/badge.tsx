import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a9396] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#006073] text-white",
        secondary:
          "border-transparent bg-[#ead7a5] text-[#02121a]",
        destructive:
          "border-transparent bg-[#9d2227] text-white",
        outline: "text-[#02121a] border-[#94d2bd]",
        success:
          "border-transparent bg-[#94d2bd] text-[#02121a]",
        warning:
          "border-transparent bg-[#ed9b05] text-[#02121a]",
        info:
          "border-transparent bg-[#0a9396] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
