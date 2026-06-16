import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md'
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400 focus:ring-cyan-500',
  secondary:
    'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-slate-100 focus:ring-slate-600',
  danger:
    'bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 focus:ring-red-500',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-950 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
