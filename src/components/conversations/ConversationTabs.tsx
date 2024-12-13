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
        console.log("[DEBUG] No conversationSocket yet, skipping initMainConversation");
        return;
      }
    
      console.log("[DEBUG] useEffect in ConversationTabs triggered for main conversation init");

      // If we've already done init, skip
      if (hasInitializedMain.current) {
        return;
      }
    
      const initMainConversation = async () => {
        console.log("[DEBUG] initMainConversation called");
        try {
          const conversationId = await conversationSocket.createMainConversation();
          console.log("[DEBUG] initMainConversation success, conversationId =", conversationId);
    
          setMainConversationId(conversationId);  // <--- React setState
          console.log("[DEBUG] setMainConversationId called with", conversationId);
    
          useConversationStore.getState().addConversation({
            id: conversationId,
            type: 'main'
          });
          console.log("[DEBUG] useConversationStore.addConversation called with", conversationId);
    
        } catch (error) {
          console.error('[DEBUG] Failed to create main conversation:', error);
          setError('Failed to create conversation');
        }
      };
    
      console.log("[DEBUG] Calling initMainConversation() exactly once");
      initMainConversation();
      hasInitializedMain.current = true;
    }, [conversationSocket]);

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
            highlightText
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
      <div className="flex flex-col h-full">
        {/* Tabs */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-4 py-2 rounded-lg ${
              activeTab === 'main'
                ? 'bg-earth-100 text-earth-600'
                : 'bg-earth-600 text-white hover:bg-earth-200'
            }`}
          >
            Main
          </button>
          {chunkConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveTab(conv.id)}
              className={`px-4 py-2 rounded-lg ${
                activeTab === conv.id
                  ? 'bg-earth-100 text-earth-600'
                  : 'bg-earth-600 text-white hover:bg-earth-200'
              }`}
            >
              {conv.highlightText!.substring(0, 20)}...
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="text-red-500 mb-4 text-center">
            {error}
          </div>
        )}

        {/* Active conversation */}
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
          <div>Initializing conversations...</div>
        )}
      </div>
    );
  }
);

ConversationTabs.displayName = 'ConversationTabs';

export default ConversationTabs; 