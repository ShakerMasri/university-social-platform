import Form from "next/form";
import type { Locale } from "@/i18n/locales";
import { archiveText } from "@/i18n/archive";
import { postText } from "@/i18n/posts";
import { searchText } from "@/i18n/search";
import { postTypes } from "@/server/posts/policy";
import { Button } from "@/ui/components/button";
import { Select, TextField } from "@/ui/components/field";
import { SearchIcon } from "@/ui/icons";
import type { SearchRequest } from "./search-request";
import styles from "./search.module.css";

/**
 * The page's own search form: a GET form (client-side navigation through
 * next/form), so every search is a URL. On phones it replaces the header
 * field. The Posts tab adds the community and type filters. The key resets
 * the fields to the URL whenever a new server snapshot arrives.
 */
export function SearchForm({ locale, request, communities, moreCommunities }: {
  locale: Locale; request: SearchRequest;
  communities?: readonly { id: string; name: string }[]; moreCommunities?: boolean;
}) {
  const text = searchText[locale], archive = archiveText[locale], posts = postText[locale];
  const filters = request.tab === "posts" && communities !== undefined;
  return (
    <Form key={JSON.stringify([request.tab, request.query, request.community, request.type])} action={`/${locale}/search`} className={styles.form} role="search" aria-label={text.title}>
      {request.tab !== "all" && <input type="hidden" name="tab" value={request.tab} />}
      <div className={styles.queryRow}>
        <TextField
          id="search-query" name="q" type="search" label={text.query} defaultValue={request.query}
          maxLength={200} enterKeyHint="search" autoComplete="off" className={styles.queryInput}
          hint={request.tab === "posts" ? archive.hint : undefined}
        />
        <Button type="submit" variant="primary" icon={<SearchIcon size={18} />} className={styles.submit}>{text.submit}</Button>
      </div>
      {filters && (
        <fieldset className={styles.filters}>
          <legend className={styles.legend}>{text.filters}</legend>
          <Select
            id="search-community" name="community" label={archive.community} defaultValue={request.community ?? ""}
            options={[{ value: "", label: archive.allCommunities }, ...communities.map((item) => ({ value: item.id, label: item.name }))]}
            hint={moreCommunities ? archive.moreCommunities : undefined}
          />
          <Select
            id="search-type" name="type" label={posts.type} defaultValue={request.type ?? ""}
            options={[{ value: "", label: archive.allTypes }, ...postTypes.map((value) => ({ value, label: posts.types[value] }))]}
          />
        </fieldset>
      )}
    </Form>
  );
}
