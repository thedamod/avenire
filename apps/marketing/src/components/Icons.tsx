import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function LogoMark(props: IconProps) {
  return (
    <svg viewBox="0 0 198 154" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M119 116.5V81.5C119 79.1 117 78.167 116 78H83C79.8 78 78.381 80.333 78.071 81.5V116.5C78.071 117.667 76.752 120.223 72.104 122.5C67 125 34.974 143.667 19.393 153C18.565 153.333 16.609 153.5 15.415 151.5C14.222 149.5 10.608 143.333 8.951 140.5C8.454 139.333 8.255 136.6 11.437 135C14.62 133.4 36.3 121 46.743 115C47.572 114.167 49.031 112.1 48.235 110.5C47.439 108.9 45.914 108.167 45.251 108H1.989C1.326 108 0 107.6 0 106V91.389C0 90.593 0.398 89 1.989 89H44.37C45.659 89 48.235 88.3 48.235 85.5C48.235 82.7 45.251 81 43.76 80.5L9.448 60.5C8.951 60.167 8.255 59 9.448 57C10.642 55 14.918 47.5 16.907 44C17.239 43.667 18.399 43.3 20.388 44.5C22.377 45.7 59.341 67.333 77.574 78L43.76 19.5C43.262 18.833 42.864 17.2 45.251 16C47.638 14.8 54.534 10.5 57.683 8.5C58.18 8.167 59.573 8.2 61.164 11C62.755 13.8 75.751 36.167 82.049 47C84.204 47.667 88.514 47.9 88.514 43.5V1.385C88.514 0.923 89.011 0 91 0H106C108 0 108.5 0.923 108.5 1.385V43.5C108.5 47.9 112.833 47.667 115 47C121.333 36.167 134.4 13.8 136 11C137.6 8.2 139 8.167 139.5 8.5C142.667 10.5 149.6 14.8 152 16C154.4 17.2 154 18.833 153.5 19.5L119.5 78C137.833 67.333 175 45.7 177 44.5C179 43.3 180.167 43.667 180.5 44C182.5 47.5 186.8 55 188 57C189.2 59 188.5 60.167 188 60.5L153.5 80.5C152 81 149 82.7 149 85.5C149 88.3 151.59 89 152.886 89H195.5C197.1 89 197.5 90.593 197.5 91.389V106C197.5 107.6 196.167 108 195.5 108H152C151.333 108.167 149.8 108.9 149 110.5C148.2 112.1 149.667 114.167 150.5 115C161 121 182.8 133.4 186 135C189.2 136.6 189 139.333 188.5 140.5C186.833 143.333 183.2 149.5 182 151.5C180.8 153.5 178.833 153.333 178 153C162.333 143.667 129.5 125 125 122.5C120.454 119.975 119 117.667 119 116.5Z" />
    </svg>
  );
}

export function WebIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...stroke} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15" />
      <path d="M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5z" />
    </svg>
  );
}

export function PdfIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...stroke} {...props}>
      <path d="M5 2.5h6.5L15.5 6.5v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
      <path d="M11.5 2.5v4h4" />
      <path d="M7 10.5h6" />
      <path d="M7 13.5h6" />
    </svg>
  );
}

export function DocIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...stroke} {...props}>
      <path d="M5.5 2.5h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
      <path d="M7 7h6" />
      <path d="M7 10h6" />
      <path d="M7 13h3.5" />
    </svg>
  );
}

export function AudioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...stroke} {...props}>
      <path d="M3 8.5v3" />
      <path d="M6.5 5.5v9" />
      <path d="M10 2.5v15" />
      <path d="M13.5 6.5v7" />
      <path d="M17 8.5v3" />
    </svg>
  );
}

export function MarkdownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...stroke} {...props}>
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <path d="M5 13V7l2 2.5L9 7v6" />
      <path d="M14 7v6" />
      <path d="M12.25 11.25L14 13l1.75-1.75" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth={1.3} {...props}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      <path d="M3 4.5l5 4 5-4" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 22 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3 2.5v19a1 1 0 0 0 1.5.86l16-9.5a1 1 0 0 0 0-1.72l-16-9.5A1 1 0 0 0 3 2.5z" />
    </svg>
  );
}
