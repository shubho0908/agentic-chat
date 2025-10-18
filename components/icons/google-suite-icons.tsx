import type { SVGProps } from 'react';

export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.366l8.073-5.873C21.69 2.28 24 3.434 24 5.457z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function DriveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M7.71 3.5L1.15 15l3.58 6.5L12 9.5 7.71 3.5z" fill="#0066DA" />
      <path d="M7.71 3.5h8.57L12 9.5 7.71 3.5z" fill="#00AC47" />
      <path d="M16.28 3.5l6.56 11.5-3.58 6.5L12 9.5l4.28-6z" fill="#EA4335" />
      <path d="M12 9.5l-7.27 12h14.54L12 9.5z" fill="#00832D" />
      <path d="M12 9.5l7.27 12H4.73L12 9.5z" fill="#2684FC" />
      <path d="M12 9.5L4.73 21.5h14.54L12 9.5z" fill="#FFBA00" />
    </svg>
  );
}

export function DocsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M14.727 2H6.545C5.692 2 5 2.692 5 3.545v16.91C5 21.308 5.692 22 6.545 22h10.91c.853 0 1.545-.692 1.545-1.545V6.273L14.727 2z"
        fill="#4285F4"
      />
      <path
        d="M14.727 2v4.273H19L14.727 2z"
        fill="#A1C2FA"
      />
      <path
        d="M8 10h8v1H8v-1zm0 3h8v1H8v-1zm0 3h5v1H8v-1z"
        fill="#F1F1F1"
      />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4" />
      <rect x="3" y="4" width="18" height="6" rx="2" fill="#1967D2" />
      <path
        d="M7 2v4M17 2v4"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text
        x="12"
        y="18"
        fontSize="10"
        fontWeight="bold"
        fill="#fff"
        textAnchor="middle"
      >
        31
      </text>
    </svg>
  );
}

export function SheetsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M14.727 2H6.545C5.692 2 5 2.692 5 3.545v16.91C5 21.308 5.692 22 6.545 22h10.91c.853 0 1.545-.692 1.545-1.545V6.273L14.727 2z"
        fill="#0F9D58"
      />
      <path
        d="M14.727 2v4.273H19L14.727 2z"
        fill="#87CEAC"
      />
      <path
        d="M8 10h8v8H8v-8zm0 0h4v4H8v-4zm4 0h4v4h-4v-4zm-4 4h4v4H8v-4zm4 0h4v4h-4v-4z"
        fill="#F1F1F1"
      />
    </svg>
  );
}

export function SlidesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M14.727 2H6.545C5.692 2 5 2.692 5 3.545v16.91C5 21.308 5.692 22 6.545 22h10.91c.853 0 1.545-.692 1.545-1.545V6.273L14.727 2z"
        fill="#F4B400"
      />
      <path
        d="M14.727 2v4.273H19L14.727 2z"
        fill="#F9E9A1"
      />
      <rect x="8" y="10" width="8" height="6" fill="#fff" opacity="0.8" />
    </svg>
  );
}

export const GOOGLE_SUITE_SERVICES = [
  { name: 'Gmail', icon: GmailIcon, color: '#EA4335' },
  { name: 'Drive', icon: DriveIcon, color: '#4285F4' },
  { name: 'Docs', icon: DocsIcon, color: '#4285F4' },
  { name: 'Calendar', icon: CalendarIcon, color: '#4285F4' },
  { name: 'Sheets', icon: SheetsIcon, color: '#0F9D58' },
  { name: 'Slides', icon: SlidesIcon, color: '#F4B400' },
] as const;
