import { useEffect, useMemo, useRef, useState } from "react";
import {
  createForumComment,
  createForumPost,
  deleteForumAttachment,
  deleteForumPost,
  fetchForumPost,
  fetchForumPosts,
  forumAttachmentUrl,
  toggleForumLike,
  uploadForumAttachment,
  type ForumAttachment,
  type ForumPost,
  type ForumPostDetail,
} from "../lib/api";
import RichTextEditor, { richTextPlainText } from "../components/forum/RichTextEditor";

const categories = [
  { value: "all", label: "All discussions", icon: "✦", description: "Everything from the community" },
  { value: "job_search", label: "Job search", icon: "⌕", description: "Search strategies and market insights" },
  { value: "interviews", label: "Interviews", icon: "◉", description: "Questions, preparation, and debriefs" },
  { value: "cv_cover_letter", label: "CV & cover letters", icon: "▤", description: "Feedback and writing advice" },
  { value: "career_change", label: "Career change", icon: "↗", description: "Changing fields and transferable skills" },
  { value: "visa_nz", label: "Working in NZ", icon: "◎", description: "Visa and New Zealand workplace topics" },
  { value: "workplace", label: "Workplace", icon: "◇", description: "Culture, growth, and work life" },
  { value: "success_story", label: "Success stories", icon: "★", description: "Offers, lessons, and encouragement" },
  { value: "general", label: "General", icon: "◌", description: "Anything else career-related" },
];

function categoryLabel(value: string) {
  return categories.find((item) => item.value === value)?.label || "General";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "KJ";
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black text-white shadow-sm ${small ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm"}`}>{initials(name)}</span>;
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RichContent({ content }: { content: string }) {
  const isHtml = /<\/?(?:p|div|h2|h3|ul|ol|li|blockquote|strong|em|span|a|br)\b/i.test(content);
  if (!isHtml) return <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{content}</div>;
  return <div className="text-[15px] leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:pl-4 [&_h2]:my-4 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:my-3 [&_h3]:text-xl [&_h3]:font-bold [&_li]:ml-6 [&_ol]:my-3 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: content }} />;
}

function Attachments({ items }: { items: ForumAttachment[] }) {
  if (!items.length) return null;
  return <section className="mt-6"><h2 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Attachments</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((item) => item.kind === "image" ? <a key={item.id} href={forumAttachmentUrl(item.id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><img src={forumAttachmentUrl(item.id)} alt={item.filename} className="h-48 w-full object-cover transition group-hover:scale-[1.02]" /><span className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="truncate font-bold text-slate-700">{item.filename}</span><span className="shrink-0 text-slate-400">{fileSize(item.size_bytes)}</span></span></a> : <a key={item.id} href={forumAttachmentUrl(item.id)} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 hover:border-brand-300 hover:bg-brand-50"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl">📎</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{item.filename}</span><span className="text-xs text-slate-400">{fileSize(item.size_bytes)} · Download</span></span></a>)}</div></section>;
}

export default function ForumPage() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [selected, setSelected] = useState<ForumPostDetail | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postCategory, setPostCategory] = useState("job_search");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [attachments, setAttachments] = useState<ForumAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadPosts() {
    setLoading(true);
    setError("");
    try {
      setPosts(await fetchForumPosts({ category, query: submittedQuery, sort }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPosts(); }, [category, submittedQuery, sort]);

  const discussionCount = posts.length;
  const replyCount = useMemo(() => posts.reduce((total, post) => total + post.comment_count, 0), [posts]);

  async function openPost(postId: number) {
    setBusy(true);
    setError("");
    try {
      setSelected(await fetchForumPost(postId));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publishPost() {
    if (title.trim().length < 5 || richTextPlainText(content).length < 20) {
      setError("Add a clear title and at least 20 characters of useful detail.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createForumPost({
        category: postCategory,
        title: title.trim(),
        content: content.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
        attachment_ids: attachments.map((item) => item.id),
      });
      setComposerOpen(false);
      setTitle(""); setContent(""); setTags(""); setAttachments([]);
      await loadPosts();
      await openPost(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachments(files: FileList | null) {
    if (!files?.length) return;
    if (attachments.length + files.length > 10) {
      setError("You can attach up to 10 files to one post.");
      return;
    }
    setUploading(true);
    setError("");
    const uploaded: ForumAttachment[] = [];
    try {
      for (const file of Array.from(files)) uploaded.push(await uploadForumAttachment(file));
      setAttachments((items) => [...items, ...uploaded]);
    } catch (e) {
      void Promise.allSettled(uploaded.map((item) => deleteForumAttachment(item.id)));
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAttachment(item: ForumAttachment) {
    try {
      await deleteForumAttachment(item.id);
      setAttachments((items) => items.filter((attachment) => attachment.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function closeComposer() {
    const pending = attachments;
    setComposerOpen(false);
    setAttachments([]);
    setTitle("");
    setContent("");
    setTags("");
    void Promise.allSettled(pending.map((item) => deleteForumAttachment(item.id)));
  }

  async function like(postId: number) {
    try {
      const result = await toggleForumLike(postId);
      setPosts((rows) => rows.map((post) => post.id === postId ? { ...post, liked_by_me: result.liked, like_count: result.like_count } : post));
      setSelected((post) => post?.id === postId ? { ...post, liked_by_me: result.liked, like_count: result.like_count } : post);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addComment() {
    if (!selected || comment.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await createForumComment(selected.id, comment.trim());
      setSelected({ ...selected, comments: [...selected.comments, created], comment_count: selected.comment_count + 1 });
      setPosts((rows) => rows.map((post) => post.id === selected.id ? { ...post, comment_count: post.comment_count + 1 } : post));
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePost() {
    if (!selected || !window.confirm("Delete this discussion and all of its replies?")) return;
    setBusy(true);
    try {
      await deleteForumPost(selected.id);
      setSelected(null);
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 pb-10">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900">← Back to community</button>
        {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3"><Avatar name={selected.author.display_name} /><div><p className="font-bold text-slate-900">{selected.author.display_name}</p><p className="text-xs text-slate-500">{relativeTime(selected.created_at)} · {categoryLabel(selected.category)}</p></div></div>
            {selected.can_delete ? <button type="button" disabled={busy} onClick={() => void removePost()} className="text-xs font-bold text-rose-600 hover:underline">Delete post</button> : null}
          </div>
          <h1 className="mt-6 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{selected.title}</h1>
          <div className="mt-5"><RichContent content={selected.content} /></div>
          <Attachments items={selected.attachments} />
          {selected.tags.length ? <div className="mt-6 flex flex-wrap gap-2">{selected.tags.map((tag) => <span key={tag} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">#{tag}</span>)}</div> : null}
          <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5 text-sm text-slate-500">
            <button type="button" onClick={() => void like(selected.id)} className={`rounded-xl px-4 py-2 font-bold transition ${selected.liked_by_me ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600"}`}>{selected.liked_by_me ? "♥" : "♡"} {selected.like_count}</button>
            <span>💬 {selected.comment_count} replies</span><span>◉ {selected.view_count} views</span>
          </div>
        </article>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-black text-slate-950">Replies ({selected.comments.length})</h2>
          <div className="mt-5 space-y-5">
            {!selected.comments.length ? <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No replies yet. Add the first helpful response.</p> : null}
            {selected.comments.map((item) => <div key={item.id} className="flex gap-3 border-b border-slate-100 pb-5 last:border-0"><Avatar name={item.author.display_name} small /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-900">{item.author.display_name}</span><span className="text-xs text-slate-400">{relativeTime(item.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p></div></div>)}
          </div>
          <label className="mt-6 block text-sm font-bold text-slate-700">Join the discussion
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="Share a helpful, respectful response…" className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>
          <div className="mt-3 flex justify-end"><button type="button" disabled={busy || comment.trim().length < 2} onClick={() => void addComment()} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">{busy ? "Posting…" : "Post reply"}</button></div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b0d3a] via-[#2d175c] to-[#6732a5] p-6 text-white shadow-[0_28px_80px_-38px_rgba(76,29,149,.8)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-violet-200">KiwiJob Community</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Learn from people on the same journey.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100/75">Share job-search experiences, interview lessons, CV advice, career changes, and what it is like finding work in New Zealand.</p></div><button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-brand-900 shadow-lg transition hover:-translate-y-0.5">+ Start a discussion</button></div>
        <div className="mt-7 flex gap-6 text-sm"><span><strong className="text-xl">{discussionCount}</strong><span className="ml-2 text-violet-200/70">discussions shown</span></span><span><strong className="text-xl">{replyCount}</strong><span className="ml-2 text-violet-200/70">replies</span></span></div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-5">
          <p className="px-3 pb-2 pt-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Topics</p>
          {categories.map((item) => <button type="button" key={item.value} onClick={() => setCategory(item.value)} className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${category === item.value ? "bg-brand-100 text-brand-950" : "text-slate-600 hover:bg-slate-50"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">{item.icon}</span><span><span className="block text-sm font-bold">{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 opacity-70">{item.description}</span></span></button>)}
        </aside>

        <main className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
            <form onSubmit={(e) => { e.preventDefault(); setSubmittedQuery(query.trim()); }} className="flex min-w-0 flex-1 gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search discussions…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /><button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Search</button></form>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="latest">Latest</option><option value="popular">Popular</option></select>
          </div>

          {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading community discussions…</div> : null}
          {!loading && !posts.length ? <div className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-12 text-center"><div className="text-3xl">✦</div><h2 className="mt-3 text-lg font-black text-slate-900">No discussions here yet</h2><p className="mt-1 text-sm text-slate-500">Be the first person to share something useful with the community.</p><button type="button" onClick={() => setComposerOpen(true)} className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">Start a discussion</button></div> : null}
          {posts.map((post) => <article key={post.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"><div className="flex gap-4"><Avatar name={post.author.display_name} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-bold text-slate-800">{post.author.display_name}</span><span>·</span><span>{relativeTime(post.created_at)}</span><span className="rounded-full bg-brand-50 px-2 py-1 font-bold text-brand-700">{categoryLabel(post.category)}</span></div><button type="button" disabled={busy} onClick={() => void openPost(post.id)} className="mt-2 block text-left"><h2 className="text-lg font-black leading-6 text-slate-950 group-hover:text-brand-800">{post.title}</h2><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.content}</p></button>{post.tags.length ? <div className="mt-3 flex flex-wrap gap-2">{post.tags.map((tag) => <span key={tag} className="text-xs font-semibold text-brand-700">#{tag}</span>)}</div> : null}<div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500"><button type="button" onClick={() => void like(post.id)} className={post.liked_by_me ? "text-rose-600" : "hover:text-rose-600"}>{post.liked_by_me ? "♥" : "♡"} {post.like_count}</button><button type="button" onClick={() => void openPost(post.id)} className="hover:text-brand-700">💬 {post.comment_count}</button><span>◉ {post.view_count}</span></div></div></div></article>)}
        </main>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="new-post-title" className="my-auto w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">New discussion</p><h2 id="new-post-title" className="mt-2 text-2xl font-black text-slate-950">Share with the community</h2></div>
              <button type="button" onClick={closeComposer} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <label className="block text-sm font-bold text-slate-700">Topic<select value={postCategory} onChange={(e) => setPostCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">{categories.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="block text-sm font-bold text-slate-700">Title<input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder="What would help someone understand your discussion?" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>
              </div>
              <div><p className="mb-2 text-sm font-bold text-slate-700">Your experience or question</p><RichTextEditor value={content} onChange={setContent} placeholder="Share useful context, what you tried, and what you learned or want help with…" /><p className="mt-1 text-right text-xs text-slate-400">{richTextPlainText(content).length.toLocaleString()} / 30,000 characters</p></div>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">Images & attachments</p><p className="mt-0.5 text-xs text-slate-500">Up to 10 files, 10 MB each. Images, PDF, Word, Excel, PowerPoint, text, CSV, and ZIP.</p></div><button type="button" disabled={uploading || attachments.length >= 10} onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-brand-200 bg-white px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50">{uploading ? "Uploading…" : "📎 Attach files"}</button></div>
                <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(e) => void uploadAttachments(e.target.files)} className="sr-only" />
                {attachments.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{attachments.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">{item.kind === "image" ? <img src={forumAttachmentUrl(item.id)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100">📄</span>}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{item.filename}</span><span className="text-[11px] text-slate-400">{fileSize(item.size_bytes)}</span></span><button type="button" onClick={() => void removeAttachment(item)} className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50" aria-label={`Remove ${item.filename}`}>✕</button></div>)}</div> : null}
              </div>
              <label className="block text-sm font-bold text-slate-700">Tags <span className="font-normal text-slate-400">(optional, separated by commas)</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Auckland, interview, data analyst" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>
              <p className="text-xs leading-5 text-slate-500">Be respectful and avoid sharing private employer, interviewer, or candidate information.</p>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeComposer} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button><button type="button" disabled={busy || uploading || richTextPlainText(content).length < 20} onClick={() => void publishPost()} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{busy ? "Publishing…" : "Publish discussion"}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
