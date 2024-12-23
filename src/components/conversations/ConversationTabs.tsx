// src/components/conversations/ConversationTabs.tsx
import { useEffect, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { ConversationData } from '@/lib/websocket/types';
import MainConversation from './MainConversation';
import ChunkConversation from './ChunkConversation';
import { useSocket } from '@/contexts/SocketContext';
import { useConversationStore } from '@/stores/conversationStores';

export interface ConversationTabsRef {
  createChunkConversation: (
    highlightText: string, 
    chunkId: string,
    range?: { start: number; end: number }
  ) => Promise<void>;
  setActiveTab: (tabId: string) => void;
}

interface ConversationTabsProps {
  documentId: string;
  currentSequence: string;
}

const ConversationTabs = forwardRef<ConversationTabsRef, ConversationTabsProps>(
  ({ documentId, currentSequence }, ref) => {
    const { conversationSocket } = useSocket();
    const [activeTab, setActiveTab] = useState<'main' | string>('main');
    const [chunkConversations, setChunkConversations] = useState<ConversationData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [mainConversationId, setMainConversationId] = useState<string | null>(null);
    
    const hasInitializedMain = useRef(false);

    useEffect(() => {
      if (!conversationSocket) {
        console.log("[DEBUG] No conversationSocket yet, skipping initConversations");
        return;
      }
    
      console.log("[DEBUG] useEffect in ConversationTabs triggered for conversation init");
    
      // If we've already done init for the main conversation, skip this part
      if (hasInitializedMain.current) {
        return;
      }
    
      const initConversations = async () => {
        console.log("[DEBUG] initConversations called");
        try {
          // 1. Request list of existing conversations
          const conversations = await conversationSocket.listConversations();
          const conversationIds = Object.keys(conversations);
    
          if (conversationIds.length === 0) {
            // No existing conversations, create a new main one
            console.log("[DEBUG] No existing conversations found, creating main conversation");
            const conversationId = await conversationSocket.createMainConversation();
            console.log("[DEBUG] initMainConversation success, conversationId =", conversationId);
    
            setMainConversationId(conversationId);
            console.log("[DEBUG] setMainConversationId called with", conversationId);
    
            useConversationStore.getState().addConversation({
              id: conversationId,
              type: 'main'
            });
          } else {
            // Use first existing conversation
            const firstConversationId = conversationIds[0];
            console.log("[DEBUG] Existing conversations found, using:", firstConversationId);
    
            useConversationStore.getState().addConversation({
              id: firstConversationId,
              type: 'main'
            });
    
            await conversationSocket.getMessages(firstConversationId);
    
            setMainConversationId(firstConversationId);
            console.log("[DEBUG] mainConversationId set to existing conversation:", firstConversationId);
          }
    
          // Load chunk conversations for the initial currentSequence (usually 0)
          // This initial load happens once
          await loadChunkConversationsForSequence();
        } catch (error) {
          console.error('[DEBUG] Failed to load or create conversation:', error);
          setError('Failed to load or create conversation');
        }
      };
    
      const loadChunkConversationsForSequence = async () => {
        if (!conversationSocket || !mainConversationId) return;
        try {
          const chunkConvResponse = await conversationSocket.getChunkConversations(currentSequence);
          const chunkConvIds = Object.keys(chunkConvResponse.conversations);
    
          // Clear out the old chunk conversations if desired
          setChunkConversations([]);
    
          for (const convId of chunkConvIds) {
            const convData = chunkConvResponse.conversations[convId];
            const { highlight_text, chunk_id, highlight_range } = convData;
    
            if (!highlight_text || highlight_text.trim() === "") {
              console.log(`[DEBUG] Skipping chunk conversation ${convId} because highlight_text is empty`);
              continue;
            }
    
            useConversationStore.getState().addConversation({
              id: convId,
              type: 'chunk',
              chunkId: chunk_id.toString(),
              highlightText: highlight_text
            });
    
            if (highlight_range && highlight_range.start !== undefined && highlight_range.end !== undefined) {
              useConversationStore.getState().addHighlight({
                id: `highlight-${Date.now()}-${convId}`,
                text: highlight_text,
                startOffset: highlight_range.start,
                endOffset: highlight_range.end,
                conversationId: convId,
                chunkId: chunk_id.toString(),
              });
            }
    
            await conversationSocket.getMessages(convId);
    
            const messages = useConversationStore.getState().getMessages(convId);
            setChunkConversations(prev => [...prev, {
              id: convId,
              type: 'chunk',
              chunkId: chunk_id.toString(),
              highlightText: highlight_text,
              messages
            }]);
          }
        } catch (e) {
          console.error('Failed to load chunk conversations:', e);
        }
      };
    
      console.log("[DEBUG] Calling initConversations() exactly once");
      initConversations();
      hasInitializedMain.current = true;
    }, [conversationSocket]);

    useEffect(() => {
      // If mainConversationId or conversationSocket aren't set yet, skip
      if (!conversationSocket || !mainConversationId) return;
    
      // This effect re-runs when currentSequence changes, reloading the chunk conversations for that chunk.
      const loadChunkForNewSequence = async () => {
        try {
          useConversationStore.getState().removeHighlightsForChunk(currentSequence);          

          // Clear out old chunk conversations for a clean slate if desired
          setChunkConversations([]);
    
          const chunkConvResponse = await conversationSocket.getChunkConversations(currentSequence);
          const chunkConvIds = Object.keys(chunkConvResponse.conversations);
    
          for (const convId of chunkConvIds) {
            const convData = chunkConvResponse.conversations[convId];
            const { highlight_text, chunk_id, highlight_range } = convData;
    
            if (!highlight_text || highlight_text.trim() === "") {
              console.log(`[DEBUG] Skipping chunk conversation ${convId} because highlight_text is empty`);
              continue;
            }
    
            useConversationStore.getState().addConversation({
              id: convId,
              type: 'chunk',
              chunkId: chunk_id.toString(),
              highlightText: highlight_text
            });
    
            if (highlight_range && highlight_range.start !== undefined && highlight_range.end !== undefined) {
              useConversationStore.getState().addHighlight({
                id: `highlight-${Date.now()}-${convId}`,
                text: highlight_text,
                startOffset: highlight_range.start,
                endOffset: highlight_range.end,
                conversationId: convId,
                chunkId: chunk_id.toString(),
              });
            }
    
            await conversationSocket.getMessages(convId);
    
            const messages = useConversationStore.getState().getMessages(convId);
            setChunkConversations(prev => [...prev, {
              id: convId,
              type: 'chunk',
              chunkId: chunk_id.toString(),
              highlightText: highlight_text,
              messages
            }]);
          }
        } catch (e) {
          console.error('Failed to load chunk conversations:', e);
        }
      };
    
      loadChunkForNewSequence();
    }, [conversationSocket, mainConversationId, currentSequence]);

    // Expose methods through ref
    useImperativeHandle(ref, () => ({
      createChunkConversation: async (highlightText: string, chunkId: string, range?: { start: number; end: number }) => {
        if (!conversationSocket) {
          setError('WebSocket not initialized');
          return;
        }

        try {
          const conversationId = await conversationSocket.createChunkConversation(
            chunkId,
            highlightText,
            range
          );

          // Add conversation to store
          useConversationStore.getState().addConversation({
            id: conversationId,
            type: 'chunk',
            chunkId,
            highlightText
          });

          // Add highlight to store if range is provided
          if (range) {
            useConversationStore.getState().addHighlight({
              id: `highlight-${Date.now()}`,
              text: highlightText,
              startOffset: range.start,
              endOffset: range.end,
              conversationId,
              chunkId
            });
          }

          setChunkConversations(prev => [...prev, {
            id: conversationId,
            type: 'chunk',
            chunkId,
            highlightText,
            messages: []
          }]);

          setActiveTab(conversationId);
        } catch (error) {
          console.error('Failed to create chunk conversation:', error);
          setError('Failed to create conversation');
        }
      },
      
      setActiveTab: (tabId: string) => {
        setActiveTab(tabId);
      }
    }));

    return (
      <div className="flex flex-col h-full bg-doc-content-bg border border-doc-content-border rounded-lg shadow-sm">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 p-4 pb-0">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'main'
                ? 'bg-tab-active-bg text-tab-active-text font-medium shadow-sm'
                : 'bg-tab-inactive-bg text-tab-inactive-text hover:bg-tab-hover-bg'
            }`}
          >
            Main
          </button>
          {chunkConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveTab(conv.id)}
              className={`px-4 py-2 rounded-lg transition-colors max-w-[200px] truncate ${
                activeTab === conv.id
                  ? 'bg-tab-active-bg text-tab-active-text font-medium shadow-sm'
                  : 'bg-tab-inactive-bg text-tab-inactive-text hover:bg-tab-hover-bg'
              }`}
              title={conv.highlightText}
            >
              {conv.highlightText!.substring(0, 20)}...
            </button>
          ))}
        </div>

        <div className="px-4">
          <div className="border-b border-doc-content-border w-full"></div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4">
            <div className="text-error p-3 bg-error/10 rounded-lg text-center">
              {error}
            </div>
          </div>
        )}

        {/* Active conversation */}
        <div className="flex-1 p-4 pt-4 overflow-hidden">
          {conversationSocket && mainConversationId ? (
            activeTab === 'main' ? (
              <MainConversation
                documentId={documentId}
                currentChunkId={currentSequence}
                conversationId={mainConversationId}
              />
            ) : (
              <ChunkConversation
                documentId={documentId}
                chunkId={currentSequence}
                conversationId={activeTab}
                highlightText={chunkConversations.find(conv => conv.id === activeTab)?.highlightText || ''}
              />
            )
          ) : (
            <div className="text-doc-subtitle text-center p-4 bg-doc-content-bg/50 rounded-lg">
              Initializing conversations...
            </div>
          )}
        </div>
      </div>
    );
  }
);

ConversationTabs.displayName = 'ConversationTabs';

export default ConversationTabs; 