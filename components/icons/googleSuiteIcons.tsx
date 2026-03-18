import { useId, type SVGProps } from "react";

export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 49.4 512 399.42" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g fill="none" fillRule="evenodd">
        <g fillRule="nonzero">
          <path
            fill="#4285f4"
            d="M34.91 448.818h81.454V251L0 163.727V413.91c0 19.287 15.622 34.91 34.91 34.91z"
          />
          <path
            fill="#34a853"
            d="M395.636 448.818h81.455c19.287 0 34.909-15.622 34.909-34.909V163.727L395.636 251z"
          />
          <path
            fill="#fbbc04"
            d="M395.636 99.727V251L512 163.727v-46.545c0-43.142-49.25-67.782-83.782-41.891z"
          />
        </g>
        <path
          fill="#ea4335"
          d="M116.364 251V99.727L256 204.455 395.636 99.727V251L256 355.727z"
        />
        <path
          fill="#c5221f"
          fillRule="nonzero"
          d="M0 117.182v46.545L116.364 251V99.727L83.782 75.291C49.25 49.4 0 74.04 0 117.18z"
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
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z"
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
        d="M14.727 2H6.545C5.692 2 5 2.692 5 3.545v16.91C5 21.308 5.692 22 6.545 22h10.91c.853 0 1.545-.692 1.545-1.545V6.273L14.727 2z"
        fill="#4285F4"
      />
      <path d="M14.727 2v4.273H19L14.727 2z" fill="#A1C2FA" />
      <path d="M8 10h8v1H8v-1zm0 3h8v1H8v-1zm0 3h5v1H8v-1z" fill="#F1F1F1" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  const clipPathId = useId();

  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g clipPath={`url(#${clipPathId})`}>
        <path d="M390.736 121.264H121.264V390.736H390.736V121.264Z" fill="white" />
        <path d="M390.736 512L512 390.736L451.368 380.392L390.736 390.736L379.67 446.196L390.736 512Z" fill="#EA4335" />
        <path d="M0 390.736V471.578C0 493.912 18.088 512 40.42 512H121.264L133.714 451.368L121.264 390.736L55.198 380.392L0 390.736Z" fill="#188038" />
        <path d="M512 121.264V40.42C512 18.088 493.912 0 471.58 0H390.736C383.36 30.072 379.671 52.2027 379.67 66.392C379.67 80.58 383.359 98.8707 390.736 121.264C417.556 128.944 437.767 132.784 451.368 132.784C464.969 132.784 485.18 128.945 512 121.264Z" fill="#1967D2" />
        <path d="M512 121.264H390.736V390.736H512V121.264Z" fill="#FBBC04" />
        <path d="M390.736 390.736H121.264V512H390.736V390.736Z" fill="#34A853" />
        <path d="M390.736 0H40.422C18.088 0 0 18.088 0 40.42V390.736H121.264V121.264H390.736V0Z" fill="#4285F4" />
        <path d="M176.54 330.308C166.468 323.504 159.494 313.568 155.688 300.428L179.066 290.796C181.186 298.88 184.891 305.145 190.182 309.592C195.436 314.038 201.836 316.228 209.314 316.228C216.959 316.228 223.527 313.903 229.018 309.254C234.51 304.606 237.272 298.678 237.272 291.504C237.272 284.16 234.375 278.164 228.582 273.516C222.788 268.868 215.512 266.544 206.822 266.544H193.314V243.404H205.44C212.917 243.404 219.216 241.382 224.336 237.338C229.456 233.298 232.016 227.772 232.016 220.732C232.016 214.468 229.726 209.482 225.146 205.744C220.566 202.004 214.77 200.118 207.73 200.118C200.858 200.118 195.402 201.938 191.36 205.608C187.319 209.289 184.282 213.937 182.534 219.116L159.394 209.482C162.458 200.792 168.084 193.112 176.336 186.476C184.588 179.84 195.132 176.506 207.932 176.506C217.398 176.506 225.92 178.326 233.466 181.996C241.01 185.668 246.938 190.754 251.216 197.222C255.496 203.722 257.616 210.998 257.616 219.082C257.616 227.334 255.63 234.308 251.656 240.034C247.682 245.76 242.796 250.138 237.002 253.204V254.584C244.483 257.669 250.982 262.735 255.798 269.238C260.682 275.806 263.142 283.654 263.142 292.818C263.142 301.978 260.816 310.164 256.168 317.338C251.52 324.514 245.088 330.172 236.934 334.282C228.75 338.392 219.554 340.482 209.348 340.482C197.524 340.514 186.612 337.112 176.54 330.308ZM320.132 214.298L294.466 232.858L281.632 213.39L327.678 180.176H345.328V336.842H320.132V214.298Z" fill="#4285F4" />
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
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask0})`}>
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L56.4365 16.8843L45.398 1.43036Z" fill="#0F9D58" />
      </g>
      <mask id={mask1} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask1})`}>
        <path d="M18.9054 48.8962V80.908H54.2288V48.8962H18.9054ZM34.3594 76.4926H23.3209V70.9733H34.3594V76.4926ZM34.3594 67.6617H23.3209V62.1424H34.3594V67.6617ZM34.3594 58.8309H23.3209V53.3116H34.3594V58.8309ZM49.8134 76.4926H38.7748V70.9733H49.8134V76.4926ZM49.8134 67.6617H38.7748V62.1424H49.8134V67.6617ZM49.8134 58.8309H38.7748V53.3116H49.8134V58.8309Z" fill="#F1F1F1" />
      </g>
      <mask id={mask2} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask2})`}>
        <path d="M47.3352 25.9856L71.8905 50.5354V27.9229L47.3352 25.9856Z" fill={`url(#${gradient})`} />
      </g>
      <mask id={mask3} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask3})`}>
        <path d="M45.398 1.43036V21.2998C45.398 24.959 48.3618 27.9229 52.0211 27.9229H71.8905L45.398 1.43036Z" fill="#87CEAC" />
      </g>
      <mask id={mask4} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask4})`}>
        <path d="M7.86688 1.43036C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V8.60542C1.24374 4.9627 4.22415 1.98229 7.86688 1.98229H45.398V1.43036H7.86688Z" fill="white" fillOpacity="0.2" />
      </g>
      <mask id={mask5} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask5})`}>
        <path d="M65.2674 98.0177H7.86688C4.22415 98.0177 1.24374 95.0373 1.24374 91.3946V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V91.3946C71.8905 95.0373 68.9101 98.0177 65.2674 98.0177Z" fill="#263238" fillOpacity="0.2" />
      </g>
      <mask id={mask6} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="71" height="98">
        <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white" />
      </mask>
      <g mask={`url(#${mask6})`}>
        <path d="M52.0211 27.9229C48.3618 27.9229 45.398 24.959 45.398 21.2998V21.8517C45.398 25.511 48.3618 28.4748 52.0211 28.4748H71.8905V27.9229H52.0211Z" fill="#263238" fillOpacity="0.1" />
      </g>
      <path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill={`url(#${radial})`} />
      <defs>
        <linearGradient id={gradient} x1="59.6142" y1="28.0935" x2="59.6142" y2="50.5388" gradientUnits="userSpaceOnUse">
          <stop stopColor="#263238" stopOpacity="0.2" />
          <stop offset="1" stopColor="#263238" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={radial} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(3.48187 3.36121) scale(113.917)">
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
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask0})`}>
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L56.029 15.6881L44.8232 0Z" fill="#F4B400" />
      </g>
      <mask id={mask1} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask1})`}>
        <path d="M50.4261 44.8232H21.291C19.4421 44.8232 17.9293 46.336 17.9293 48.185V77.3201C17.9293 79.169 19.4421 80.6818 21.291 80.6818H50.4261C52.2751 80.6818 53.7879 79.169 53.7879 77.3201V48.185C53.7879 46.336 52.2751 44.8232 50.4261 44.8232ZM49.3056 70.5966H22.4116V54.9085H49.3056V70.5966Z" fill="#F1F1F1" />
      </g>
      <mask id={mask2} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask2})`}>
        <path d="M46.7899 24.9273L71.7172 49.849V26.8939L46.7899 24.9273Z" fill={`url(#${gradient})`} />
      </g>
      <mask id={mask3} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask3})`}>
        <path d="M44.8232 0V20.1705C44.8232 23.8852 47.832 26.8939 51.5467 26.8939H71.7172L44.8232 0Z" fill="#FADA80" />
      </g>
      <mask id={mask4} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask4})`}>
        <path d="M44.8232 0V0.56029L71.1569 26.8939H71.7172L44.8232 0Z" fill="white" fillOpacity="0.1" />
      </g>
      <mask id={mask5} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask5})`}>
        <path d="M6.72348 0C3.02557 0 0 3.02557 0 6.72348V7.28377C0 3.58586 3.02557 0.56029 6.72348 0.56029H44.8232V0H6.72348Z" fill="white" fillOpacity="0.2" />
      </g>
      <mask id={mask6} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask6})`}>
        <path d="M64.9937 98.0508H6.72348C3.02557 98.0508 0 95.0253 0 91.3273V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V91.3273C71.7172 95.0253 68.6916 98.0508 64.9937 98.0508Z" fill="#BF360C" fillOpacity="0.2" />
      </g>
      <mask id={mask7} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="99">
        <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill="white" />
      </mask>
      <g mask={`url(#${mask7})`}>
        <path d="M51.5467 26.8939C47.832 26.8939 44.8232 23.8852 44.8232 20.1705V20.7307C44.8232 24.4455 47.832 27.4542 51.5467 27.4542H71.7172V26.8939H51.5467Z" fill="#BF360C" fillOpacity="0.1" />
      </g>
      <path d="M44.8232 0H6.72348C3.02557 0 0 3.02557 0 6.72348V91.8876C0 95.5855 3.02557 98.6111 6.72348 98.6111H64.9937C68.6916 98.6111 71.7172 95.5855 71.7172 91.8876V26.8939L44.8232 0Z" fill={`url(#${radial})`} />
      <defs>
        <linearGradient id={gradient} x1="59.2549" y1="27.0671" x2="59.2549" y2="49.8525" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BF360C" stopOpacity="0.2" />
          <stop offset="1" stopColor="#BF360C" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={radial} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(2.27204 1.9601) scale(115.643)">
          <stop stopColor="white" stopOpacity="0.1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export const GOOGLE_SUITE_SERVICES = [
  { name: "Gmail", icon: GmailIcon, color: "#EA4335" },
  { name: "Drive", icon: DriveIcon, color: "#4285F4" },
  { name: "Docs", icon: DocsIcon, color: "#4285F4" },
  { name: "Calendar", icon: CalendarIcon, color: "#4285F4" },
  { name: "Sheets", icon: SheetsIcon, color: "#0F9D58" },
  { name: "Slides", icon: SlidesIcon, color: "#F4B400" },
] as const;
