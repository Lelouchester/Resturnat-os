import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-black active:scale-[0.98]',
  secondary: 'bg-surface text-ink border border-ink/10 hover:border-ink/20 active:scale-[0.98]',
  ghost: 'bg-transparent text-ink hover:bg-ink/5 active:scale-[0.98]',
  danger: 'bg-status-cleaning text-white hover:brightness-95 active:scale-[0.98]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <button
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
}
