import { FeedPageView, type FeedPageProps } from "./feed-page";
export const dynamic = "force-dynamic";
export default function Feed(props: FeedPageProps) { return <FeedPageView {...props} />; }
