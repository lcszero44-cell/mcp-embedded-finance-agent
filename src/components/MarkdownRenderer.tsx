import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-50">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[12px] text-cyan-300 border border-slate-700/70"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Markdown Table
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      lines[i + 1].includes('---')
    ) {
      const headers = parseTableRow(lines[i]);
      const alignCells = parseTableRow(lines[i + 1]);
      const alignments = alignCells.map((cell) => {
        if (cell.endsWith(':') && cell.startsWith(':')) return 'text-center';
        if (cell.endsWith(':')) return 'text-right';
        return 'text-left';
      });
      i += 2;

      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }

      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-3 overflow-x-auto rounded-lg border border-slate-700/70 bg-slate-950/70"
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700/80 bg-slate-900/90 text-slate-300">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className={`px-3 py-2 font-semibold whitespace-nowrap ${alignments[idx] ?? 'text-left'}`}
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-200">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-3 py-2 ${alignments[cIdx] ?? 'text-left'}`}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3
          key={`h3-${i}`}
          className="mt-1 mb-2 text-sm font-bold tracking-tight text-cyan-300"
        >
          {renderInline(trimmed.slice(4))}
        </h3>,
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push(
        <h4
          key={`h4-${i}`}
          className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300"
        >
          {renderInline(trimmed.slice(5))}
        </h4>,
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2.5 rounded-r-lg border-l-2 border-cyan-400/80 bg-cyan-950/30 px-3 py-2 text-xs leading-relaxed text-slate-200 space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInline(ql)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push(
        <ul
          key={`ul-${i}`}
          className="my-2 space-y-1.5 pl-4 text-[13px] leading-relaxed text-slate-200 list-disc marker:text-cyan-400"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-1.5 text-[13px] leading-relaxed text-slate-200">
        {renderInline(trimmed)}
      </p>,
    );
    i += 1;
  }

  return <div className="space-y-0.5">{blocks}</div>;
};
