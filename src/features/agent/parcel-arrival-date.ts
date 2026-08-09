export type ParcelArrivalDateParts = {
  date: string;
  time: string;
};

export function formatParcelArrivalDate(value: string): ParcelArrivalDateParts {
  const normalized = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(normalized);

  if (!isoMatch) {
    return { date: normalized || "—", time: "—" };
  }

  const [, year, month, day, hour, minute] = isoMatch;
  return {
    date: `${day}/${month}/${year}`,
    time: `${hour}:${minute}`
  };
}
