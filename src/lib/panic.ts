export function calcPanicScore(deadline: string, estimatedHours: number): number {
  const now = new Date()
  const due = new Date(deadline)
  const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursLeft <= 0) return 100

  const pressure = estimatedHours / hoursLeft
  return Math.min(Math.round(pressure * 100), 100)
}

export function getPanicColor(score: number): string {
  if (score >= 75) return '#ef4444'
  if (score >= 40) return '#f97316'
  return '#22c55e'
}

export function getPanicLabel(score: number): string {
  if (score >= 75) return 'Code Red'
  if (score >= 40) return 'Heating Up'
  return 'All Good'
}