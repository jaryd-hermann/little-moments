export function initOneSignal(): void {}

export function syncOneSignalUser(
  _userId: string | null,
  _email: string | null = null,
): void {}

export function syncOneSignalThreadTags(
  _tags: Record<string, string>,
): void {}

export function syncOneSignalMomentTags(_totalMoments: number): void {}

export function syncOneSignalEngagementTags(_opts: {
  currentStreak: number;
  totalPinned: number;
}): void {}

export function syncOneSignalScheduleTags(_opts: {
  timezone: string | null;
  notificationTime: string | null;
}): void {}

export function addOneSignalClickListener(
  _handler: (event: unknown) => void,
): () => void {
  return () => {};
}
