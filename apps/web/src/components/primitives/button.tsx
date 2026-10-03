import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// HU-017a §9.1: press en pointer-down (§1), hover solo con puntero fino, objetivo táctil de 44 px.
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium press touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover pressed:bg-primary-pressed",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover pressed:bg-destructive-pressed",
        "destructive-tinted":
          "bg-destructive-muted text-destructive hover:bg-destructive-muted-hover pressed:bg-destructive-muted-pressed pressed:text-destructive-pressed",
        tinted: "bg-primary-soft text-primary hover:bg-primary-soft-hover pressed:bg-primary-soft-pressed pressed:text-primary-vibrant",
        secondary: "bg-secondary text-foreground hover:bg-fill-hover pressed:bg-fill-pressed",
        outline: "border border-border bg-background text-foreground hover:bg-overlay-hover pressed:bg-overlay-pressed",
        ghost: "text-foreground hover:bg-overlay-hover pressed:bg-overlay-pressed",
        plain: "text-primary hover:text-primary-hover pressed:opacity-60",
        link: "[--press-scale:1] text-primary underline-offset-4 hover:underline pressed:opacity-60",
      },
      size: {
        default: "h-9 rounded-md px-4 text-callout font-medium",
        sm: "h-8 rounded-md px-3 text-subheadline font-medium",
        lg: "h-11 rounded-lg px-5 text-base font-semibold",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-11 rounded-lg [&_svg]:size-5",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
