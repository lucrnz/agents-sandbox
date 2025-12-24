import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, sanitizeUrl } from "@/frontend/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "prose dark:prose-invert max-w-none",
}) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mt-0 mb-4 text-2xl font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-6 mb-3 text-xl font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-medium">{children}</h3>,
          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
          code: ({ className, children, node, ...props }) => (
            <code
              className={cn(
                "custom-scrollbar block w-full overflow-x-auto rounded bg-gray-100 p-2 font-mono text-sm dark:bg-neutral-800",
                className,
              )}
              {...props}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => <pre className="max-w-fit">{children}</pre>,
          ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal pl-6">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => {
            const safeHref = sanitizeUrl(href);
            return (
              <a
                href={safeHref}
                className="text-sky-600 underline hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-600"
                target={safeHref.startsWith("http") ? "_blank" : undefined}
                rel={safeHref.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="mb-4 border-l-4 border-gray-300 pl-4 italic dark:border-neutral-700">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="mb-4 w-full border-collapse">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold dark:border-neutral-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-4 py-2 dark:border-neutral-700">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
