const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
] as const;

export function cronMatches(expression: string, at: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  const parts = [
    at.getUTCMinutes(),
    at.getUTCHours(),
    at.getUTCDate(),
    at.getUTCMonth() + 1,
    at.getUTCDay(),
  ];
  const matches = fields.map(
    (field, index) =>
      field === '*' || field.split(',').some((piece) => Number(piece) === parts[index]),
  );
  const [minute, hour, dayOfMonth, month, dayOfWeek] = matches;
  const day =
    fields[2] !== '*' && fields[4] !== '*' ? dayOfMonth || dayOfWeek : dayOfMonth && dayOfWeek;
  return Boolean(minute && hour && month && day);
}

export function cronSupported(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  return fields.every((field, index) => fieldSupported(field, FIELD_RANGES[index]!));
}

function fieldSupported(field: string, range: readonly [number, number]): boolean {
  if (field === '*') {
    return true;
  }
  const pieces = field.split(',');
  const [min, max] = range;
  return (
    pieces.length > 0 &&
    pieces.every((piece) => {
      if (!/^\d+$/.test(piece)) {
        return false;
      }
      const value = Number(piece);
      return value >= min && value <= max;
    })
  );
}
