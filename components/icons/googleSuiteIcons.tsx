import { useId, type SVGProps } from "react";

export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 49.4 512 399.42" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g fill="none" fillRule="evenodd">
        <g fillRule="nonzero">
          <path
            fill="#4285f4"
            d="M34.91 448.82h81.45V251L0 163.73V413.91c0 19.29 15.62 34.91 34.91 34.91z"
          />
          <path
            fill="#34a853"
            d="M395.64 448.82h81.45c19.29 0 34.91-15.62 34.91-34.91V163.73L395.64 251z"
          />
          <path
            fill="#fbbc04"
            d="M395.64 99.73V251L512 163.73v-46.55c0-43.14-49.25-67.78-83.78-41.89z"
          />
        </g>
        <path
          fill="#ea4335"
          d="M116.36 251V99.73L256 204.46 395.64 99.73V251L256 355.73z"
        />
        <path
          fill="#c5221f"
          fillRule="nonzero"
          d="M0 117.18v46.55L116.36 251V99.73L83.78 75.29C49.25 49.4 0 74.04 0 117.18z"
        />
      </g>
    </svg>
  );
}

export function DriveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="#0066da"
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"
      />
      <path
        fill="#00ac47"
        d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"
      />
      <path
        fill="#ea4335"
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.80l5.85 11.5z"
      />
      <path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

// SVGL currently does not publish a Google Docs asset, so this remains the
// existing TSX component until the registry adds one.
export function DocsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M14.73 2H6.54C5.69 2 5 2.69 5 3.54v16.91C5 21.31 5.69 22 6.54 22h10.91c.853 0 1.54-.692 1.54-1.54V6.27L14.73 2z"
        fill="#4285F4"
      />
      <path d="M14.73 2v4.27H19L14.73 2z" fill="#A1C2FA" />
      <path d="M8 10h8v1H8v-1zm0 3h8v1H8v-1zm0 3h5v1H8v-1z" fill="#F1F1F1" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  const clipPathId = useId();

  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g clipPath={`url(#${clipPathId})`}>
        <path d="M390.74 121.26H121.26V390.74H390.74V121.26Z" fill="white" />
        <path d="M390.74 512L512 390.74L451.37 380.39L390.74 390.74L379.67 446.20L390.74 512Z" fill="#EA4335" />
        <path d="M0 390.74V471.58C0 493.91 18.09 512 40.42 512H121.26L133.71 451.37L121.26 390.74L55.20 380.39L0 390.74Z" fill="#188038" />
        <path d="M512 121.26V40.42C512 18.09 493.91 0 471.58 0H390.74C383.36 30.07 379.67 52.20 379.67 66.39C379.67 80.58 383.36 98.87 390.74 121.26C417.56 128.94 437.77 132.78 451.37 132.78C464.97 132.78 485.18 128.94 512 121.26Z" fill="#1967D2" />
        <path d="M512 121.26H390.74V390.74H512V121.26Z" fill="#FBBC04" />
        <path d="M390.74 390.74H121.26V512H390.74V390.74Z" fill="#34A853" />
        <path d="M390.74 0H40.42C18.09 0 0 18.09 0 40.42V390.74H121.26V121.26H390.74V0Z" fill="#4285F4" />
        <path d="M176.54 330.31C166.47 323.50 159.49 313.57 155.69 300.43L179.07 290.80C181.19 298.88 184.89 305.14 190.18 309.59C195.44 314.04 201.84 316.23 209.31 316.23C216.96 316.23 223.53 313.90 229.02 309.25C234.51 304.61 237.27 298.68 237.27 291.50C237.27 284.16 234.38 278.16 228.58 273.52C222.79 268.87 215.51 266.54 206.82 266.54H193.31V243.40H205.44C212.92 243.40 219.22 241.38 224.34 237.34C229.46 233.30 232.02 227.77 232.02 220.73C232.02 214.47 229.73 209.48 225.15 205.74C220.57 202.00 214.77 200.12 207.73 200.12C200.86 200.12 195.40 201.94 191.36 205.61C187.32 209.29 184.28 213.94 182.53 219.12L159.39 209.48C162.46 200.79 168.08 193.11 176.34 186.48C184.59 179.84 195.13 176.51 207.93 176.51C217.40 176.51 225.92 178.33 233.47 182.00C241.01 185.67 246.94 190.75 251.22 197.22C255.50 203.72 257.62 211.00 257.62 219.08C257.62 227.33 255.63 234.31 251.66 240.03C247.68 245.76 242.80 250.14 237.00 253.20V254.58C244.48 257.67 250.98 262.74 255.80 269.24C260.68 275.81 263.14 283.65 263.14 292.82C263.14 301.98 260.82 310.16 256.17 317.34C251.52 324.51 245.09 330.17 236.93 334.28C228.75 338.39 219.55 340.48 209.35 340.48C197.52 340.51 186.61 337.11 176.54 330.31ZM320.13 214.30L294.47 232.86L281.63 213.39L327.68 180.18H345.33V336.84H320.13V214.30Z" fill="#4285F4" />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <rect width="512" height="512" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function SheetsIcon(props: SVGProps<SVGSVGElement>) {
  const mask0 = useId();
  const mask1 = useId();
  const mask2 = useId();
  const mask3 = useId();
  const mask4 = useId();
  const mask5 = useId();
  const mask6 = useId();
  const gradient = useId();
  const radial = useId();

  return (
    <svg viewBox="0 0 74 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <mask id={mask0} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask0})`}>
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L56.44 16.88L45.40 1.43Z" fill="#0F9D58" />
      </g>
      <mask id={mask1} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask1})`}>
        <path d="M18.91 48.90V80.91H54.23V48.90H18.91ZM34.36 76.49H23.32V70.97H34.36V76.49ZM34.36 67.66H23.32V62.14H34.36V67.66ZM34.36 58.83H23.32V53.31H34.36V58.83ZM49.81 76.49H38.77V70.97H49.81V76.49ZM49.81 67.66H38.77V62.14H49.81V67.66ZM49.81 58.83H38.77V53.31H49.81V58.83Z" fill="#F1F1F1" />
      </g>
      <mask id={mask2} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask2})`}>
        <path d="M47.34 25.99L71.89 50.54V27.92L47.34 25.99Z" fill={`url(#${gradient})`} />
      </g>
      <mask id={mask3} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask3})`}>
        <path d="M45.40 1.43V21.30C45.40 24.96 48.36 27.92 52.02 27.92H71.89L45.40 1.43Z" fill="#87CEAC" />
      </g>
      <mask id={mask4} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask4})`}>
        <path d="M7.87 1.43C4.22 1.43 1.24 4.41 1.24 8.05V8.61C1.24 4.96 4.22 1.98 7.87 1.98H45.40V1.43H7.87Z" fill="white" fillOpacity="0.2" />
      </g>
      <mask id={mask5} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask5})`}>
        <path d="M65.27 98.02H7.87C4.22 98.02 1.24 95.04 1.24 91.39V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V91.39C71.89 95.04 68.91 98.02 65.27 98.02Z" fill="#263238" fillOpacity="0.2" />
      </g>
      <mask id={mask6} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill="white" />
      </mask>
      <g mask={`url(#${mask6})`}>
        <path d="M52.02 27.92C48.36 27.92 45.40 24.96 45.40 21.30V21.85C45.40 25.51 48.36 28.47 52.02 28.47H71.89V27.92H52.02Z" fill="#263238" fillOpacity="0.1" />
      </g>
      <path d="M45.40 1.43H7.87C4.22 1.43 1.24 4.41 1.24 8.05V91.95C1.24 95.59 4.22 98.57 7.87 98.57H65.27C68.91 98.57 71.89 95.59 71.89 91.95V27.92L45.40 1.43Z" fill={`url(#${radial})`} />
      <defs>
        <linearGradient id={gradient} x1="59.61" y1="28.09" x2="59.61" y2="50.54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#263238" stopOpacity="0.2" />
          <stop offset="1" stopColor="#263238" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={radial} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(3.48 3.36) scale(113.92)">
          <stop stopColor="white" stopOpacity="0.1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function SlidesIcon(props: SVGProps<SVGSVGElement>) {
  const mask0 = useId();
  const mask1 = useId();
  const mask2 = useId();
  const mask3 = useId();
  const mask4 = useId();
  const mask5 = useId();
  const mask6 = useId();
  const mask7 = useId();
  const gradient = useId();
  const radial = useId();

  return (
    <svg viewBox="0 0 73 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <mask id={mask0} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask0})`}>
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L56.03 15.69L44.82 0Z" fill="#F4B400" />
      </g>
      <mask id={mask1} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask1})`}>
        <path d="M50.43 44.82H21.29C19.44 44.82 17.93 46.34 17.93 48.19V77.32C17.93 79.17 19.44 80.68 21.29 80.68H50.43C52.28 80.68 53.79 79.17 53.79 77.32V48.19C53.79 46.34 52.28 44.82 50.43 44.82ZM49.31 70.60H22.41V54.91H49.31V70.60Z" fill="#F1F1F1" />
      </g>
      <mask id={mask2} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask2})`}>
        <path d="M46.79 24.93L71.72 49.85V26.89L46.79 24.93Z" fill={`url(#${gradient})`} />
      </g>
      <mask id={mask3} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask3})`}>
        <path d="M44.82 0V20.17C44.82 23.89 47.83 26.89 51.55 26.89H71.72L44.82 0Z" fill="#FADA80" />
      </g>
      <mask id={mask4} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask4})`}>
        <path d="M44.82 0V0.56L71.16 26.89H71.72L44.82 0Z" fill="white" fillOpacity="0.1" />
      </g>
      <mask id={mask5} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask5})`}>
        <path d="M6.72 0C3.03 0 0 3.03 0 6.72V7.28C0 3.59 3.03 0.56 6.72 0.56H44.82V0H6.72Z" fill="white" fillOpacity="0.2" />
      </g>
      <mask id={mask6} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask6})`}>
        <path d="M64.99 98.05H6.72C3.03 98.05 0 95.03 0 91.33V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V91.33C71.72 95.03 68.69 98.05 64.99 98.05Z" fill="#BF360C" fillOpacity="0.2" />
      </g>
      <mask id={mask7} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask7})`}>
        <path d="M51.55 26.89C47.83 26.89 44.82 23.89 44.82 20.17V20.73C44.82 24.45 47.83 27.45 51.55 27.45H71.72V26.89H51.55Z" fill="#BF360C" fillOpacity="0.1" />
      </g>
      <path d="M44.82 0H6.72C3.03 0 0 3.03 0 6.72V91.89C0 95.59 3.03 98.61 6.72 98.61H64.99C68.69 98.61 71.72 95.59 71.72 91.89V26.89L44.82 0Z" fill={`url(#${radial})`} />
      <defs>
        <linearGradient id={gradient} x1="59.25" y1="27.07" x2="59.25" y2="49.85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BF360C" stopOpacity="0.2" />
          <stop offset="1" stopColor="#BF360C" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={radial} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(2.27 1.96) scale(115.64)">
          <stop stopColor="white" stopOpacity="0.1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}


