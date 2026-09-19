type DatedAdminNotification = Readonly<{
  id: string;
  occurredAt: string;
}>;

export function sortAdminNotificationsNewestFirst<T extends DatedAdminNotification>(
  notifications: readonly T[]
): T[] {
  return [...notifications].sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      right.id.localeCompare(left.id)
  );
}
