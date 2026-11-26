"use client";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { componentPreviewText, type ComponentPreviewText } from "@/i18n/component-preview";
import { dictionaries } from "@/i18n/dictionaries";
import { localeDirections, type Locale } from "@/i18n/locales";
import { postText } from "@/i18n/posts";
import { uiText } from "@/i18n/ui";
import { voteText } from "@/i18n/votes";
import type { Theme } from "@/ui/theme";
import { Avatar } from "@/ui/components/avatar";
import { Badge, CountBadge, DotBadge } from "@/ui/components/badge";
import { Button, ButtonLink, IconButton } from "@/ui/components/button";
import { Card } from "@/ui/components/card";
import { Chip, ChoiceChips } from "@/ui/components/chip";
import { Dialog } from "@/ui/components/dialog";
import { Select, TextField } from "@/ui/components/field";
import { Menu } from "@/ui/components/menu";
import { Skeleton, SkeletonGroup } from "@/ui/components/skeleton";
import { EmptyState, ErrorState } from "@/ui/components/state";
import { Tabs } from "@/ui/components/tabs";
import { ThemeToggle } from "@/ui/components/theme-toggle";
import { ToastProvider, useToast } from "@/ui/components/toast";
import { VoteControl, type VoteDirection } from "@/ui/components/vote-control";
import * as icons from "@/ui/icons";
import styles from "./preview.module.css";

type PostType = "QUESTION" | "DISCUSSION" | "RESOURCE" | "ANNOUNCEMENT";
const postTypes: readonly PostType[] = ["QUESTION", "DISCUSSION", "RESOURCE", "ANNOUNCEMENT"];
const postTone = { QUESTION: "question", DISCUSSION: "discussion", RESOURCE: "resource", ANNOUNCEMENT: "announcement" } as const;

export function ComponentPreview({ locale, serverTheme }: { locale: Locale; serverTheme: Theme | null }) {
  const text = componentPreviewText[locale];
  const ui = uiText[locale];
  const otherLocale: Locale = locale === "en" ? "ar" : "en";
  return (
    <div className={`ui-root ${styles.page}`}>
      <ToastProvider dismissLabel={ui.dismiss}>
        <a href="#preview-main" className={styles.skip}>{dictionaries[locale].skipToContent}</a>
        <header className={styles.header}>
          <p className={styles.brand}>{dictionaries[locale].title}</p>
          <div className={styles.headerActions}>
            <ButtonLink href={`/${otherLocale}/dev/components`} variant="ghost" size="compact" lang={otherLocale} hrefLang={otherLocale} icon={<icons.GlobeIcon />}>
              <span dir={localeDirections[otherLocale]}>{text.otherLanguage}</span>
            </ButtonLink>
            <ThemeToggle label={ui.darkTheme} serverTheme={serverTheme} />
          </div>
        </header>
        <main id="preview-main" tabIndex={-1} className={styles.main}>
          <h1 className={styles.heading}>{text.title}</h1>
          <p className={styles.intro}>{text.intro}</p>
          <div className={styles.panels}>
            {(["light", "dark"] as const).map((theme) => (
              <ThemePanel key={theme} theme={theme} title={theme === "light" ? text.lightTheme : text.darkTheme}>
                <Gallery locale={locale} text={text} />
              </ThemePanel>
            ))}
          </div>
        </main>
      </ToastProvider>
    </div>
  );
}

function ThemePanel({ theme, title, children }: { theme: Theme; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section data-theme={theme} data-preview-panel={theme} aria-labelledby={headingId} className={`ui-root ${styles.panel}`}>
      <h2 id={headingId} className={styles.panelHeading}>{title}</h2>
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.sectionHeading}>{title}</h3>
      {children}
    </section>
  );
}

function Gallery({ locale, text }: { locale: Locale; text: ComponentPreviewText }) {
  const ui = uiText[locale];
  const votes = voteText[locale];
  const types = postText[locale].types;
  const { notify } = useToast();
  const choiceName = useId();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [mine, setMine] = useState(false);
  const [postType, setPostType] = useState<PostType>("QUESTION");
  const [saved, setSaved] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCloses, setDialogCloses] = useState(0);
  const [vote, setVote] = useState<{ up: number; down: number; current: VoteDirection | null }>({ up: 12, down: 1, current: null });
  const typeOptions = postTypes.map((type) => ({ value: type, label: types[type], tone: postTone[type] }));

  function applyVote(direction: VoteDirection) {
    setVote((state) => {
      const next = state.current === direction ? null : direction;
      const up = state.up - (state.current === "up" ? 1 : 0) + (next === "up" ? 1 : 0);
      const down = state.down - (state.current === "down" ? 1 : 0) + (next === "down" ? 1 : 0);
      return { up, down, current: next };
    });
  }

  return (
    <div className={styles.gallery}>
      <Section title={text.buttons}>
        <div className={styles.row}>
          <Button>{text.primary}</Button>
          <Button variant="secondary">{text.secondary}</Button>
          <Button variant="ghost">{text.ghost}</Button>
          <Button variant="danger">{text.danger}</Button>
          <Button icon={<icons.PlusIcon />}>{text.withIcon}</Button>
          <Button disabled>{text.disabled}</Button>
          <Button pending>{text.pending}</Button>
          <Button size="compact" variant="secondary">{text.secondary}</Button>
          <ButtonLink href={`/${locale}/communities`}>{text.link}</ButtonLink>
        </div>
      </Section>

      <Section title={text.iconButtons}>
        <div className={styles.row}>
          <IconButton label={text.search} icon={<icons.SearchIcon />} />
          <IconButton label={text.share} icon={<icons.ShareIcon />} variant="secondary" />
          <IconButton label={text.save} pressed={saved} onClick={() => setSaved((value) => !value)} icon={<icons.BookmarkIcon filled={saved} />} />
          <IconButton label={ui.notifications} icon={<icons.BellIcon />} size="compact" />
          <IconButton label={text.disabled} icon={<icons.CloseIcon />} disabled />
        </div>
      </Section>

      <Section title={text.fields}>
        <div className={styles.stack}>
          <TextField label={text.titleLabel} hint={text.titleHint} placeholder={text.titlePlaceholder} required maxLength={160} />
          <TextField label={text.emailLabel} type="email" autoComplete="email" defaultValue="student@" error={text.emailError} required />
          <TextField label={text.bodyLabel} multiline rows={3} />
          <TextField label={text.disabledLabel} defaultValue={text.disabledValue} disabled />
          <Select label={text.selectLabel} options={text.selectOptions.map((label) => ({ value: label, label }))} />
        </div>
      </Section>

      <Section title={text.chips}>
        <div className={styles.row} role="group" aria-label={text.filtersLegend}>
          <Chip pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>{text.filterUnread}</Chip>
          <Chip pressed={mine} onClick={() => setMine((value) => !value)}>{text.filterMine}</Chip>
        </div>
        <ChoiceChips legend={text.typeLegend} name={choiceName} options={typeOptions} value={postType} onChange={setPostType} />
      </Section>

      <Section title={text.badges}>
        <div className={styles.row}>
          {postTypes.map((type) => <Badge key={type} tone={postTone[type]}>{types[type]}</Badge>)}
          <Badge tone="neutral" icon={<icons.LockIcon size={14} />}>{text.privateBadge}</Badge>
          <Badge tone="accent">{text.stateBadge}</Badge>
          <Badge tone="danger">{text.errorBadge}</Badge>
          <CountBadge count={3} label={text.unread(3)} locale={locale} />
          <CountBadge count={240} label={text.unread(240)} locale={locale} />
          <DotBadge label={text.unreadDot} />
        </div>
      </Section>

      <Section title={text.avatars}>
        <div className={styles.row}>
          {text.sampleNames.map((name, index) => (
            <span key={name} className={styles.labelled}>
              <Avatar name={name} seed={`sample-user-${index + 1}`} size={index === 0 ? "large" : index === 3 ? "small" : "medium"} decorative={false} />
              <bdi>{name}</bdi>
            </span>
          ))}
        </div>
      </Section>

      <Section title={text.postCard}>
        <Card as="article" className={styles.post} aria-label={text.postTitle}>
          <div className={styles.postHeader}>
            <Avatar name={text.postAuthor} seed="sample-user-1" />
            <div className={styles.postByline}>
              <p className={styles.postAuthor}><Link href={`/${locale}/people`}><bdi>{text.postAuthor}</bdi></Link></p>
              <p className={styles.postMeta}>
                {text.postMeta} <Link href={`/${locale}/communities`}><bdi>{text.postCommunity}</bdi></Link> · <time>{text.postTime}</time>
              </p>
            </div>
            <Badge tone="question">{types.QUESTION}</Badge>
          </div>
          <h4 className={styles.postTitle}>{text.postTitle}</h4>
          <p className={styles.postExcerpt}>{text.postExcerpt}</p>
          <div className={styles.postActions}>
            <VoteControl {...vote} locale={locale} labels={votes} onVote={applyVote} />
            <ButtonLink href={`/${locale}/communities`} variant="ghost" size="compact" icon={<icons.ReplyIcon />} aria-label={text.replies(4)}>
              <span aria-hidden="true" className={styles.repliesCount}>{new Intl.NumberFormat(locale).format(4)}</span>
            </ButtonLink>
            <span className={styles.postActionsEnd}>
              <IconButton label={text.save} pressed={saved} size="compact" onClick={() => setSaved((value) => !value)} icon={<icons.BookmarkIcon filled={saved} />} />
            </span>
          </div>
        </Card>
      </Section>

      <Section title={text.tabs}>
        <Tabs label={text.feedTabs} items={[
          { href: `/${locale}/dev/components`, label: text.tabCommunities, current: true },
          { href: `/${locale}/dev/components?tab=for-you`, label: text.tabForYou, current: false },
        ]} />
      </Section>

      <Section title={text.menu}>
        <div className={styles.row}>
          <Menu label={ui.moreActions} icon={<icons.MoreIcon />} variant="secondary" items={[
            { kind: "link", label: text.menuOpenPost, href: `/${locale}/communities` },
            { kind: "action", label: text.menuCopy, onSelect: () => notify(text.toastInfoMessage, "success") },
            { kind: "separator", key: "separator" },
            { kind: "action", label: text.menuReport, tone: "danger", onSelect: () => notify(text.toastErrorMessage, "error") },
          ]} />
        </div>
      </Section>

      <Section title={text.dialog}>
        <div className={styles.row}>
          <Button variant="danger" onClick={() => setDialogOpen(true)}>{text.openDialog}</Button>
          <span className={styles.labelled} data-dialog-closes>{text.dialogClosed(dialogCloses)}</span>
        </div>
        <Dialog
          open={dialogOpen} onClose={() => { setDialogOpen(false); setDialogCloses((count) => count + 1); }}
          title={text.dialogTitle} description={text.dialogDescription} closeLabel={ui.close}
          footer={<>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>{text.secondary}</Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>{text.dialogConfirm}</Button>
          </>}
        />
      </Section>

      <Section title={text.toasts}>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => notify(text.toastInfoMessage, "success")}>{text.toastInfo}</Button>
          <Button variant="secondary" onClick={() => notify(text.toastErrorMessage, "error")}>{text.toastError}</Button>
        </div>
      </Section>

      <Section title={text.votes}>
        <div className={styles.row}>
          <span className={styles.labelled}>{text.voteNone}<VoteControl up={5} down={0} current={null} locale={locale} labels={votes} onVote={() => {}} /></span>
          <span className={styles.labelled}>{text.voteUp}<VoteControl up={6} down={0} current="up" locale={locale} labels={votes} onVote={() => {}} /></span>
          <span className={styles.labelled}>{text.voteDown}<VoteControl up={5} down={1} current="down" locale={locale} labels={votes} onVote={() => {}} /></span>
          <span className={styles.labelled}>{text.voteReadOnly}<VoteControl up={1250} down={3} current={null} locale={locale} labels={votes} /></span>
        </div>
      </Section>

      <Section title={text.states}>
        <EmptyState headingLevel={4} title={text.emptyTitle} description={text.emptyDescription} action={<Button icon={<icons.PlusIcon />}>{text.withIcon}</Button>} />
        <ErrorState headingLevel={4} title={text.errorTitle} description={text.errorDescription} action={<Button variant="secondary">{ui.retry}</Button>} />
        <ErrorState headingLevel={4} tone="denied" title={text.deniedTitle} description={text.deniedDescription} action={<Button>{text.requestJoin}</Button>} />
      </Section>

      <Section title={text.skeletons}>
        <Card>
          <SkeletonGroup label={text.loadingPosts}>
            <div className={styles.skeletonPost}>
              <Skeleton shape="circle" blockSize="2.75rem" />
              <div className={styles.stack} style={{ flex: 1, gap: "var(--space-2)" }}>
                <Skeleton shape="text" inlineSize="40%" />
                <Skeleton shape="text" inlineSize="25%" />
              </div>
            </div>
            <Skeleton shape="text" inlineSize="80%" />
            <Skeleton shape="text" />
            <Skeleton blockSize="2.5rem" inlineSize="10rem" />
          </SkeletonGroup>
        </Card>
      </Section>

      <Section title={text.icons}>
        <ul className={styles.iconGrid}>
          {Object.entries(icons).map(([name, IconComponent]) => (
            <li key={name} className={styles.iconItem}><IconComponent /><code dir="ltr">{name.replace(/Icon$/, "")}</code></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
