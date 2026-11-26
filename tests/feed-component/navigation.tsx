import type { ReactNode } from "react";

export default function Link({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href}>{children}</a>;
}

const router = { refresh() { throw new Error("Unexpected navigation refresh in feed fixture"); } };
export function useRouter() {
  return router;
}
