// Line/solid icons in the spirit of Things 3. 24×24 grid, currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const svg = (children: React.ReactNode, filled = false) =>
  function Icon({ size = 22, ...rest }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...rest}
      >
        {children}
      </svg>
    );
  };

// --- List icons (solid, colored by the caller) -------------------------------
export const InboxIcon = svg(
  <path d="M5.5 3h13a2 2 0 0 1 1.9 1.4L22 10v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-8l1.6-5.6A2 2 0 0 1 5.5 3Zm-.9 7h3.9c.6 0 1 .4 1.1.9a2.4 2.4 0 0 0 4.8 0c.1-.5.5-.9 1.1-.9h3.9l-1.3-5H5.9l-1.3 5Z" />,
  true,
);
export const StarIcon = svg(
  <path d="M12 2.2c.4 0 .8.2 1 .6l2.6 5.3 5.8.8c.9.1 1.3 1.3.6 1.9l-4.2 4.1 1 5.8c.2.9-.8 1.6-1.6 1.2L12 19.2l-5.2 2.7c-.8.4-1.8-.3-1.6-1.2l1-5.8L2 10.8c-.7-.6-.3-1.8.6-1.9l5.8-.8L11 2.8c.2-.4.6-.6 1-.6Z" />,
  true,
);
export const CalendarIcon = svg(
  <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1ZM4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9H4Zm3 2.5h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-8 4h2v2H7v-2Zm4 0h2v2h-2v-2Z" />,
  true,
);
export const AnytimeIcon = svg(
  <path d="M11.1 2.3a2 2 0 0 1 1.8 0l8.3 4.2c.9.4.9 1.7 0 2.2l-8.3 4.2a2 2 0 0 1-1.8 0L2.8 8.7c-.9-.5-.9-1.8 0-2.2l8.3-4.2ZM3.6 12.3l7.5 3.8c.6.3 1.2.3 1.8 0l7.5-3.8 1.3.7c.8.4.8 1.6 0 2l-8.8 4.5c-.6.3-1.2.3-1.8 0L2.3 15c-.8-.4-.8-1.6 0-2l1.3-.7Z" />,
  true,
);
export const SomedayIcon = svg(
  <path d="M3 4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4Zm1 6h16v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-9Zm5 2.5a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H9Z" />,
  true,
);
export const LogbookIcon = svg(
  <path d="M6 2h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm10.7 7.2a1 1 0 0 0-1.4-1.4l-4.8 4.8-1.8-1.8a1 1 0 1 0-1.4 1.4l2.5 2.5a1 1 0 0 0 1.4 0l5.5-5.5Z" />,
  true,
);
export const TrashIcon = svg(
  <path d="M9 2h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1l-.9 13.1A3 3 0 0 1 15.1 22H8.9a3 3 0 0 1-3-2.9L5 6H4a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1Zm1 7a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1Zm4 0a1 1 0 0 0-1 1v7a1 1 0 1 0 2 0v-7a1 1 0 0 0-1-1Z" />,
  true,
);
export const AreaIcon = svg(
  <path d="M11 2.3a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4ZM5.4 7.6 12 11.4l6.6-3.8L12 3.9 5.4 7.6Z" />,
  true,
);
export const MoonIcon = svg(
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  true,
);
export const FlagIcon = svg(
  <path d="M5 2a1 1 0 0 1 1 1v.4c1.5-.6 3.4-.8 5.4.1 2 .9 3.6.8 5.2.1a1 1 0 0 1 1.4.9v9a1 1 0 0 1-.6.9c-2.1 1-4.4 1.1-6.8 0-1.7-.7-3.3-.5-4.6.2V21a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Z" />,
  true,
);

// --- Line icons ---------------------------------------------------------------
export const TagIcon = svg(<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /></>);
export const ChecklistIcon = svg(<><path d="m3.5 6 1.5 1.5L8 4.5" /><path d="m3.5 13 1.5 1.5L8 11.5" /><path d="M11.5 6H21M11.5 13H21M11.5 20H21" /><circle cx="5.5" cy="20" r="1" fill="currentColor" /></>);
export const RepeatIcon = svg(<><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>);
export const MoveIcon = svg(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const MoreIcon = svg(<><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>);
export const ChevronLeft = svg(<path d="m15 4-8 8 8 8" />);
export const ChevronRight = svg(<path d="m9 4 8 8-8 8" />);
export const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = svg(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></>);
export const GearIcon = svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const CloseIcon = svg(<path d="M6 6l12 12M18 6 6 18" />);
export const NotesIcon = svg(<path d="M4 6h16M4 12h16M4 18h10" />);
export const CheckIcon = svg(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const ClockIcon = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const HeadingIcon = svg(<path d="M4 7h16M4 12h10" />);
export const SunIcon = svg(<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>);
export const MoonLineIcon = svg(<path d="M20.5 13.4A8.5 8.5 0 1 1 10.6 3.5a6.6 6.6 0 0 0 9.9 9.9Z" />);
export const AutoThemeIcon = svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" /></>);
export const TomatoIcon = svg(<><path d="M12 7.6c-4.6 0-8 2.8-8 6.4 0 3.3 3.4 5.6 8 5.6s8-2.3 8-5.6c0-3.6-3.4-6.4-8-6.4Z" /><path d="M12 7.6V4.5M12 5.4c1.6-1.6 3.4-1.8 4.8-.9M12 5.4C10.4 3.8 8.6 3.6 7.2 4.5" /></>);
export const PlayIcon = svg(<path d="M7.5 4.9v14.2a1 1 0 0 0 1.5.9l11.2-7.1a1 1 0 0 0 0-1.7L9 4a1 1 0 0 0-1.5.9Z" />, true);
export const PauseIcon = svg(<><rect x="6" y="4.5" width="4.2" height="15" rx="1.4" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" /></>, true);
export const ResetIcon = svg(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5V9h4.5" /></>);
export const SkipIcon = svg(<><path d="M4.5 5.5 12 12l-7.5 6.5" /><path d="M13.5 5.5 21 12l-7.5 6.5" /></>);
