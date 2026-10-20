import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border shadow-xs hover:bg-[#4338CA] hover:text-white active:bg-[hsl(239,84%,48%)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs border border-destructive-border hover:bg-destructive/90 active:bg-destructive/95",
        outline:
          "border border-border bg-background shadow-xs hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] active:bg-surface-container-high",
        secondary:
          "border bg-secondary text-secondary-foreground border border-secondary-border hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] active:bg-secondary/95",
        ghost: "border border-transparent hover:bg-[#E8E9FF] hover:text-[#4338CA] active:bg-surface-container-high",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
