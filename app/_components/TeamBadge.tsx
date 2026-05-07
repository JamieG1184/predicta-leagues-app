import { teamBadgeUrl } from '@/src/lib/team-badges'

type Props = {
  teamName: string
  size?: number
  className?: string
}

export function TeamBadge({ teamName, size = 18, className = '' }: Props) {
  const url = teamBadgeUrl(teamName)
  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
