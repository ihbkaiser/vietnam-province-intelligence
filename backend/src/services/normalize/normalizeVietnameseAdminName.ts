const PREFIXES = [
  'tinh',
  'thanh pho',
  'tp',
  'xa',
  'phuong',
  'quan',
  'huyen',
  'thi xa',
  'thi tran',
  'dac khu'
];

function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeVietnameseAdminName(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const normalized = stripDiacritics(value)
    .toLowerCase()
    .replace(/[().,/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return PREFIXES.reduce((current, prefix) => {
    if (current.startsWith(`${prefix} `)) {
      return current.slice(prefix.length).trim();
    }

    return current;
  }, normalized);
}

