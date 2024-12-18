// components/document/SelectionTooltip.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SelectionTooltipProps {
  position: { x: number; y: number } | null;
  onChatClick: () => void;
}

export const SelectionTooltip: React.FC<SelectionTooltipProps> = ({ 
  position, 
  onChatClick 
}) => {
  if (!position) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed z-50 bg-white dark:bg-earth-900 rounded-lg shadow-lg 
                 ring-1 ring-earth-200 dark:ring-earth-700"
      style={{ 
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -150%)',
      }}
    >
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onChatClick();
        }}
        variant="ghost"
        className="flex items-center space-x-2 px-3 py-2 text-earth-600 
                   dark:text-earth-300 hover:bg-earth-100 dark:hover:bg-earth-800 
                   rounded-lg transition-colors text-sm whitespace-nowrap w-full"
      >
        <MessageCircle className="w-4 h-4" />
        <span>Chat about this</span>
      </Button>
    </motion.div>
  );
};