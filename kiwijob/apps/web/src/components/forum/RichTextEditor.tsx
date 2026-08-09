import { useEffect, useRef, useState } from "react";

const emojis = [
  "😀", "😊", "😂", "🥳", "😍", "🤔", "😅", "😢", "😮", "🙏",
  "👍", "👎", "👏", "💪", "🤝", "💡", "🎯", "✅", "⭐", "🔥",
  "🚀", "💼", "📄", "📌", "📣", "🎉", "❤️", "🇳🇿", "☕", "🌱",
];

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function richTextPlainText(value: string): string {
  const container = document.createElement("div");
  container.innerHTML = value;
  return (container.textContent || "").replace(/\u00a0/g, " ").trim();
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value && document.activeElement !== editor) editor.innerHTML = value;
  }, [value]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (savedRange.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    }
  }

  function sync() {
    const html = editorRef.current?.innerHTML || "";
    onChange(html === "<br>" ? "" : html);
    rememberSelection();
  }

  function command(name: string, commandValue?: string) {
    restoreSelection();
    document.execCommand(name, false, commandValue);
    sync();
  }

  function addLink() {
    const url = window.prompt("Paste a link (https://…)");
    if (url?.trim()) command("createLink", url.trim());
  }

  const toolbarButton = "grid h-9 min-w-9 place-items-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 hover:border-brand-300 hover:bg-brand-50";
  const toolbarSelect = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none hover:border-brand-300";

  return (
    <div className="overflow-visible rounded-2xl border border-slate-200 bg-white focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50/80 p-2">
        <select aria-label="Text style" defaultValue="p" onChange={(e) => command("formatBlock", e.target.value)} className={toolbarSelect}>
          <option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option>
        </select>
        <select aria-label="Font" defaultValue="Arial" onChange={(e) => command("fontName", e.target.value)} className={toolbarSelect}>
          <option>Arial</option><option>Georgia</option><option>Tahoma</option><option>Times New Roman</option><option>Verdana</option>
        </select>
        <select aria-label="Font size" defaultValue="3" onChange={(e) => command("fontSize", e.target.value)} className={toolbarSelect}>
          <option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option><option value="6">Title</option>
        </select>
        <span className="mx-0.5 h-6 w-px bg-slate-200" />
        <button type="button" title="Bold" onMouseDown={(e) => { e.preventDefault(); command("bold"); }} className={toolbarButton}>B</button>
        <button type="button" title="Italic" onMouseDown={(e) => { e.preventDefault(); command("italic"); }} className={`${toolbarButton} italic`}>I</button>
        <button type="button" title="Underline" onMouseDown={(e) => { e.preventDefault(); command("underline"); }} className={`${toolbarButton} underline`}>U</button>
        <button type="button" title="Strikethrough" onMouseDown={(e) => { e.preventDefault(); command("strikeThrough"); }} className={`${toolbarButton} line-through`}>S</button>
        <label title="Text colour" className={`${toolbarButton} cursor-pointer`}><span className="border-b-2 border-violet-600">A</span><input type="color" defaultValue="#334155" onInput={(e) => command("foreColor", e.currentTarget.value)} className="sr-only" /></label>
        <span className="mx-0.5 h-6 w-px bg-slate-200" />
        <button type="button" title="Bullet list" onMouseDown={(e) => { e.preventDefault(); command("insertUnorderedList"); }} className={toolbarButton}>• List</button>
        <button type="button" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); command("insertOrderedList"); }} className={toolbarButton}>1.</button>
        <button type="button" title="Align left" onMouseDown={(e) => { e.preventDefault(); command("justifyLeft"); }} className={toolbarButton}>≡</button>
        <button type="button" title="Align centre" onMouseDown={(e) => { e.preventDefault(); command("justifyCenter"); }} className={toolbarButton}>≡̇</button>
        <button type="button" title="Add link" onMouseDown={(e) => { e.preventDefault(); addLink(); }} className={toolbarButton}>🔗</button>
        <div className="relative">
          <button type="button" aria-expanded={emojiOpen} title="Add emoji" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); setEmojiOpen((open) => !open); }} className={toolbarButton}>😊</button>
          {emojiOpen ? <div className="absolute right-0 top-11 z-20 grid w-64 grid-cols-6 gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">{emojis.map((emoji) => <button key={emoji} type="button" onMouseDown={(e) => { e.preventDefault(); command("insertText", emoji); setEmojiOpen(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-brand-50">{emoji}</button>)}</div> : null}
        </div>
      </div>
      <div className="relative">
        {!richTextPlainText(value) ? <span className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">{placeholder}</span> : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onBlur={rememberSelection}
          className="min-h-56 max-h-[28rem] overflow-y-auto p-4 text-sm leading-7 text-slate-700 outline-none [&_a]:font-semibold [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:pl-4 [&_h2]:my-3 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:my-2 [&_h3]:text-xl [&_h3]:font-bold [&_li]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
        />
      </div>
    </div>
  );
}
