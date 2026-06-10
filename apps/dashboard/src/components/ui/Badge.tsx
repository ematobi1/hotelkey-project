interface BadgeProps {
  color: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple'
  children: React.ReactNode
}

const colorClasses: Record<BadgeProps['color'], string> = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-purple-100 text-purple-700',
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
