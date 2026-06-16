interface CardProps {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-800 ${className}`}>
      {children}
    </div>
  )
}
