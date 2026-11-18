// Design tokens — kept as plain values so a React web app can import the same file.
export const colors = {
  brand: '#1F3A5F',
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  text: '#101828',
  muted: '#667085',
  border: '#D0D5DD',
  credit: '#067647',
  debit: '#B42318',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 32 } as const;
