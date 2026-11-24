import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { announcementAction, postAnnouncementAction } from '@/server/actions/company';
import { businessDate, fmtDate } from '@/lib/dates';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Announcements' };

export default async function Announcements() {
  const user = await requireUser();
  const anns = await db.announcement.findMany({
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    include: { author: true },
  });
  const post = user.permissions.has('announce.post');
  return (
    <Stack>
      <PageHead title="Announcements" />
      {post ? (
        <Card title="Post an announcement">
          <ActionForm action={postAnnouncementAction}>
            <label className="field">
              Title
              <input name="title" required maxLength={120} />
            </label>
            <label className="field">
              Message
              <textarea name="body" rows={4} required maxLength={4000} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pinned" /> Pin to the top
            </label>
            <div>
              <Submit>Post</Submit>
            </div>
          </ActionForm>
        </Card>
      ) : null}
      <Card>
        {anns.length ? (
          anns.map((a) => (
            <article
              key={a.id}
              className="grid gap-1.5 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{a.title}</strong>
                {a.pinned ? (
                  <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
                    Pinned
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-line">{a.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-muted">
                  {a.author.name} · {fmtDate(businessDate(a.publishedAt))}
                </span>
                {post ? (
                  <>
                    <ActionButton
                      action={announcementAction}
                      fields={{ id: a.id, op: a.pinned ? 'unpin' : 'pin' }}
                      label={a.pinned ? 'Unpin' : 'Pin'}
                      className="btn btn-sm btn-ghost"
                    />
                    <ActionButton
                      action={announcementAction}
                      fields={{ id: a.id, op: 'remove' }}
                      label="Remove"
                      className="btn btn-sm btn-ghost"
                      confirm="Remove this announcement?"
                    />
                  </>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="text-muted">No announcements.</p>
        )}
      </Card>
    </Stack>
  );
}
