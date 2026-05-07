// Pure scoring logic. Used both by server scripts and React Server Components.

export type Prediction = {
  position: number
  team_id: number
  is_joker: boolean
}

export type ScoredPrediction = Prediction & {
  team_name: string
  actual_position: number | null
  distance: number | null
  base_points: number
  joker_multiplier: 1 | 2
  points: number
}

export function pointsForDistance(distance: number): number {
  if (distance === 0) return 5
  if (distance === 1) return 3
  if (distance === 2) return 1
  return 0
}

export function scorePrediction(
  prediction: Prediction,
  actualPosition: number | null,
  teamName: string
): ScoredPrediction {
  if (actualPosition == null) {
    return {
      ...prediction,
      team_name: teamName,
      actual_position: null,
      distance: null,
      base_points: 0,
      joker_multiplier: prediction.is_joker ? 2 : 1,
      points: 0,
    }
  }
  const distance = Math.abs(prediction.position - actualPosition)
  const base = pointsForDistance(distance)
  const multiplier: 1 | 2 = prediction.is_joker ? 2 : 1
  return {
    ...prediction,
    team_name: teamName,
    actual_position: actualPosition,
    distance,
    base_points: base,
    joker_multiplier: multiplier,
    points: base * multiplier,
  }
}

export function totalForPlayer(scored: ScoredPrediction[]): number {
  return scored.reduce((sum, s) => sum + s.points, 0)
}
