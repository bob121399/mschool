import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Model/PDF/user text: Markdown without raw HTML (skipHtml + sanitize), safe external links.
// Never dangerouslySetInnerHTML (spec 4.2, step 3.4).
const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"] },
};

export function SafeMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ?? "prose-mschool"}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline">{linkChildren}</a>
          ),
          img: ({ alt }) => <span className="text-muted-foreground">[изображение: {alt ?? "без описания"}]</span>,
          table: ({ children: tableChildren }) => (
            <div className="my-3 w-full overflow-x-auto"><table className="w-full text-sm">{tableChildren}</table></div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
