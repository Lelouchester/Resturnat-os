import type { ElementType, ComponentPropsWithoutRef } from 'react'

const BASE = 'rounded-2xl bg-surface border border-ink/5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]'

type CardProps<T extends ElementType> = {
  as?: T
  className?: string
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className'>

export function Card<T extends ElementType = 'div'>({ as, className = '', ...props }: CardProps<T>) {
  const Component = as || 'div'
  return <Component className={`${BASE} ${className}`} {...props} />
}
