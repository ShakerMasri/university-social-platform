import type { ReactNode, SVGProps } from "react";

// Original geometric icons drawn for this project (no third-party icon set).
// 24×24 grid, 1.75 stroke, currentColor. Icons are decorative: the control
// that contains one carries the accessible name.

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowUpIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}><path d="M12 4 5 12h4.5v8h5v-8H19z" fill={filled ? "currentColor" : "none"} /></Icon>
);
export const ArrowDownIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}><path d="M12 20 5 12h4.5V4h5v8H19z" fill={filled ? "currentColor" : "none"} /></Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}><path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" /></Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" /></Icon>
);
export const HomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" /></Icon>
);
export const CommunitiesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="16.5" cy="9.5" r="2.5" /><path d="M16 14a4.5 4.5 0 0 1 4.5 4.5" />
  </Icon>
);
export const MessageIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 5.5h16v11H9l-5 4z" /></Icon>
);
export const ReplyIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 19.5c4.7 0 8.5-3.2 8.5-7.25S16.7 5 12 5s-8.5 3.2-8.5 7.25c0 1.7.7 3.3 1.8 4.5L4.5 20l4-1.2c1.1.45 2.2.7 3.5.7z" /></Icon>
);
export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}><path d="M6.5 4h11v16L12 15.5 6.5 20z" fill={filled ? "currentColor" : "none"} /></Icon>
);
export const ShareIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6.5h14V13" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="m6 6 12 12M18 6 6 18" /></Icon>
);
export const MoreIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="18.5" cy="12" r="1.75" />
  </Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /></Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.5v.01" /></Icon>
);
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.5v.01" /></Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></Icon>
);
export const InboxIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 13.5 6.5 5h11l2.5 8.5V19H4zM4 13.5h4.5l1 2h5l1-2H20" /></Icon>
);
