import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/utils";

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
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-0 mb-4">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
          code: ({ className, children, node, ...props }) => (
            <code
              className={cn(
                "bg-gray-100 dark:bg-neutral-800 p-2 rounded text-sm font-mono block w-full overflow-x-auto custom-scrollbar",
                className
              )}
              {...props}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => <pre className="max-w-fit">{children}</pre>,
          ul: ({ children }) => (
            <ul className="list-disc pl-6 mb-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-4">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-1">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 dark:border-neutral-700 pl-4 italic mb-4">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table className="border-collapse w-full mb-4">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 dark:border-neutral-700 px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 dark:border-neutral-700 px-4 py-2">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
