import { FeedPageView, type FeedPageProps } from "../feed-page";
export const dynamic = "force-dynamic";
export default function ForYouFeed(props: FeedPageProps) { return <FeedPageView {...props} forYou />; }
