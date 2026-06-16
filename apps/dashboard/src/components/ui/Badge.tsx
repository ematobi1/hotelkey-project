interface BadgeProps {
  color: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple'
  children: React.ReactNode
}

const colorClasses: Record<BadgeProps['color'], string> = {
  gray: 'bg-slate-700/60 text-slate-300',
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  yellow: 'bg-amber-500/15 text-amber-400',
  red: 'bg-red-500/15 text-red-400',
  orange: 'bg-orange-500/15 text-orange-400',
  purple: 'bg-purple-500/15 text-purple-400',
}

export default function Badge({ color, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colorClasses[color]}`}
    >
      {children}
    </span>
  )
}
