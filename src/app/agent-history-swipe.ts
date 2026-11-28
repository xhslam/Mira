export function shouldCaptureHistorySwipe(open: boolean, dx: number, dy: number) {
  return (open ? Math.abs(dx) : dx) >= 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function shouldOpenHistoryActions(open: boolean, dx: number, revealWidth: number) {
  const threshold = Math.min(54, revealWidth / 3);
  return open ? dx > -threshold : dx >= threshold;
}
