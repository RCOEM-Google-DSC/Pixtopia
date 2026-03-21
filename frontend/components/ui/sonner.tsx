"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "!flex !items-center !gap-4 !px-6 !py-4 !font-sans !shadow-[0_15px_40px_-10px_rgba(0,0,0,0.4)] !rounded-3xl !border-4",
          title: "!font-bold !text-xl !tracking-wide",
          description: "!text-base !font-medium !opacity-90",
          success:
            "!bg-emerald-500 !border-emerald-700 !text-white",
          error:
            "!bg-red-500 !border-red-700 !text-white",
          info:
            "!bg-blue-500 !border-blue-700 !text-white",
          warning:
            "!bg-amber-500 !border-amber-700 !text-white",
          actionButton:
            "!bg-white !text-black !font-bold !rounded-xl !px-4 !py-2 !shadow-sm",
          cancelButton:
            "!bg-black/20 !text-white !font-bold !rounded-xl !px-4 !py-2",
          closeButton: 
            "!bg-black/20 hover:!bg-black/40 !text-white !border-0 !transition-colors !backdrop-blur-sm",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
