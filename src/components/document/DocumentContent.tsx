// src/components/document/DocumentContent.tsx
import React, { useState, useCallback, useMemo, ReactElement } from 'react';
import { useConversationStore } from '@/stores/conversationStores';
import { SelectionTooltip } from './SelectionTooltip';

interface DocumentContentProps {
  content: string;
  chunkId: string;
  onHighlightClick: (conversationId: string) => void;
  onCreateHighlight: (text: string, range: { start: number; end: number }) => void;
}

export function DocumentContent({ 
  content, 
  chunkId, 
  onHighlightClick,
  onCreateHighlight 
}: DocumentContentProps) {
  const highlights = useConversationStore(state => state.getHighlightsForChunk(chunkId));
  const [selection, setSelection] = useState<{
    text: string;
    range: { start: number; end: number };
    position: { x: number; y: number };
  } | null>(null);

  const handleTextSelection = useCallback(() => {
    const selected = window.getSelection();
    if (!selected || selected.toString().trim().length === 0) {
      setSelection(null);
      return;
    }

    const range = selected.getRangeAt(0);
    const startSpan = range.startContainer.parentElement;
    const startIndex = startSpan?.getAttribute('data-index');
    
    if (!startIndex) return;

    const startOffset = parseInt(startIndex) + range.startOffset;
    const selectedContent = selected.toString().trim();
    const rect = range.getBoundingClientRect();

    setSelection({
      text: selectedContent,
      range: {
        start: startOffset,
        end: startOffset + selectedContent.length
      },
      position: {
        x: rect.right + 10,
        y: rect.top
      }
    });
  }, []);

  const renderedContent = useMemo(() => {
    let lastIndex = 0;
    const elements: ReactElement[] = [];
    
    highlights.forEach((highlight) => {
      if (highlight.startOffset > lastIndex) {
        elements.push(
          <span
            key={`text-${lastIndex}`}
            className="text-earth-900 dark:text-earth-100"
            data-index={lastIndex}
          >
            {content.slice(lastIndex, highlight.startOffset)}
          </span>
        );
      }

      elements.push(
        <span
          key={highlight.id}
          className="bg-yellow-100/40 dark:bg-yellow-500/40 text-earth-900 
                   dark:text-earth-100 group cursor-pointer hover:bg-yellow-200/40 
                   dark:hover:bg-yellow-600/40 transition-colors"
          onClick={() => onHighlightClick(highlight.conversationId)}
          data-index={highlight.startOffset}
        >
          {content.slice(highlight.startOffset, highlight.endOffset)}
          <span className="invisible group-hover:visible absolute -top-6 left-1/2 
                         -translate-x-1/2 bg-earth-800 text-white px-2 py-1 
                         rounded text-sm whitespace-nowrap">
            Click to open chat
          </span>
        </span>
      );

      lastIndex = highlight.endOffset;
    });

    if (lastIndex < content.length) {
      elements.push(
        <span
          key="text-end"
          className="text-earth-900 dark:text-earth-100"
          data-index={lastIndex}
        >
          {content.slice(lastIndex)}
        </span>
      );
    }

    return elements;
  }, [content, highlights, onHighlightClick]);

  return (
    <div className="bg-white dark:bg-earth-800 rounded-lg shadow-sm p-6 relative">
      <div 
        className="prose dark:prose-invert max-w-none"
        onMouseUp={handleTextSelection}
      >
        <pre className="whitespace-pre-wrap font-palatino">
          {renderedContent}
        </pre>
      </div>
      
      <SelectionTooltip
        position={selection?.position ?? null}
        onChatClick={() => {
          if (selection) {
            onCreateHighlight(selection.text, selection.range);
            setSelection(null);
          }
        }}
      />
    </div>
  );
}