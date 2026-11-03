// Original geometric SVGs for this project; no external icon/font package.
export function VoteIcon({ direction, selected = false }: { direction: "up" | "down"; selected?: boolean }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill={selected ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d={direction === "up" ? "M12 3 3 12h5v9h8v-9h5Z" : "M12 21 3 12h5V3h8v9h5Z"} />
  </svg>;
}
export function CommentIcon() {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-7l-5.5 3v-3A3 3 0 0 1 3 14.5v-7a3 3 0 0 1 3-3Z" />
  </svg>;
}
