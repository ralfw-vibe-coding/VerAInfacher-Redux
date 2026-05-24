import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Button({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(className)} type={type} {...props} />
}
