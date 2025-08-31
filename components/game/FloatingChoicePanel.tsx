// components/game/FloatingChoicePanel.tsx
import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { SpinnerIcon, SparklesIcon } from '../Icons';

interface FloatingChoicePanelProps {
    isAiReady: boolean;
    apiKeyError: string | null;
    isLoading: boolean;
    choices: string[];
    handleAction: (action: string) => void;
    debouncedHandleAction: (action: string) => void;
    customAction: string;
    setCustomAction: (action: string) => void;
    handleSuggestAction: () => void;
    isCustomActionLocked: boolean;
    className?: string;
    isHighTokenCooldown?: boolean;
    cooldownTimeLeft?: number;
}

export const FloatingChoicePanel: React.FC<FloatingChoicePanelProps> = memo(({
    isAiReady,
    apiKeyError,
    isLoading,
    choices,
    handleAction,
    debouncedHandleAction,
    customAction,
    setCustomAction,
    handleSuggestAction,
    isCustomActionLocked,
    className = '',
    isHighTokenCooldown = false,
    cooldownTimeLeft = 0
}) => {
    const [isChoicesExpanded, setIsChoicesExpanded] = useState(false);
    
    // Local state for input to prevent lag
    const [localCustomAction, setLocalCustomAction] = useState(customAction);
    const [isComposing, setIsComposing] = useState(false);
    
    // Sync local state with parent state only when parent changes externally
    useEffect(() => {
        if (!isComposing && customAction !== localCustomAction) {
            setLocalCustomAction(customAction);
        }
    }, [customAction, isComposing]);
    
    // Debounced update to parent state
    const debouncedUpdateRef = useRef<NodeJS.Timeout>();
    useEffect(() => {
        if (isComposing) return;
        
        if (debouncedUpdateRef.current) {
            clearTimeout(debouncedUpdateRef.current);
        }
        
        debouncedUpdateRef.current = setTimeout(() => {
            setCustomAction(localCustomAction);
        }, 300);
        
        return () => {
            if (debouncedUpdateRef.current) {
                clearTimeout(debouncedUpdateRef.current);
            }
        };
    }, [localCustomAction, isComposing, setCustomAction]);

    // IME composition handlers
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true);
    }, []);
    
    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
        setIsComposing(false);
        setLocalCustomAction(e.currentTarget.value);
    }, []);
    
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLocalCustomAction(value);
    }, []);
    
    const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !isComposing) {
            debouncedHandleAction(localCustomAction);
            setIsChoicesExpanded(false);
        }
    }, [localCustomAction, debouncedHandleAction, isComposing]);
    
    const handleSendAction = useCallback(() => {
        handleAction(localCustomAction);
        setIsChoicesExpanded(false);
    }, [localCustomAction, handleAction]);

    return (
        <div className={`fixed bottom-0 left-4 right-4 z-50 ${className}`}>
            {/* Toggle Button */}
            <div className="flex justify-center mb-2">
                <button
                    onClick={() => setIsChoicesExpanded(!isChoicesExpanded)}
                    className="bg-gradient-to-r from-slate-800/90 to-slate-900/90 hover:from-cyan-500/40 hover:to-blue-500/40 backdrop-blur-xl border border-slate-600/60 hover:border-cyan-400/60 text-white px-4 py-2 rounded-t-2xl shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2"
                >
                    <span className="text-sm font-medium">⚔️ Lựa Chọn Của Ngươi</span>
                    <span className="text-xs bg-cyan-500/60 text-white font-semibold px-2 py-1 rounded-full shadow-sm">
                        {choices.length}
                    </span>
                    <svg 
                        className={`w-4 h-4 transition-transform duration-300 ${isChoicesExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Expandable Choices Panel */}
            <div className={`bg-slate-900/95 backdrop-blur-xl border border-white/30 rounded-t-2xl shadow-2xl transition-all duration-300 ${
                isChoicesExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
            }`}>
                {/* Choices Content */}
                <div className="p-4">
                    {!isAiReady ? (
                        <div className="text-center bg-red-500/10 backdrop-blur-sm border border-red-400/20 rounded-2xl p-4">
                            <div className="text-red-300 mb-2 text-xl">⚠️</div>
                            <p className="text-white/80 text-sm font-medium">AI chưa sẵn sàng</p>
                        </div>
                    ) : isLoading && choices.length === 0 ? (
                        <div className="flex items-center justify-center">
                            <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-xl border border-cyan-400/30 px-4 py-3 rounded-2xl">
                                <SpinnerIcon className="w-5 h-5 text-cyan-300" />
                                <span className="text-white font-medium text-sm">Đang tải lựa chọn...</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {choices.map((choice, index) => (
                                <button 
                                    key={index}
                                    onClick={() => {
                                        handleAction(choice);
                                        setIsChoicesExpanded(false);
                                    }}
                                    disabled={isHighTokenCooldown}
                                    className={`group w-full text-left p-3 bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 rounded-xl transition-all duration-300 shadow-lg ${
                                        isHighTokenCooldown 
                                            ? 'opacity-50 cursor-not-allowed' 
                                            : 'hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/60 hover:shadow-xl transform hover:scale-[1.01]'
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-r from-cyan-500/60 to-blue-500/60 rounded-lg flex items-center justify-center text-white font-bold text-xs group-hover:from-cyan-500/80 group-hover:to-blue-500/80 transition-all duration-300 shadow-sm">
                                            {index + 1}
                                        </div>
                                        <div className="flex-grow">
                                            <p className="text-white group-hover:text-cyan-100 transition-colors duration-300 text-sm font-medium">
                                                {choice.match(/^\d+\.\s/) ? choice.replace(/^\d+\.\s/, '') : choice}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Custom Action Footer */}
                <div className="border-t border-white/10 p-4">
                    <div className="mb-3">
                        <p className="text-sm text-white/70 font-medium mb-1">
                            💭 Hành động tùy ý
                        </p>
                        <p className="text-xs text-white/50">
                            Nhập hành động của riêng bạn (thêm "nsfw" ở cuối để có nội dung 18+)
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <input 
                            type="text"
                            value={localCustomAction}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                            onCompositionStart={handleCompositionStart}
                            onCompositionEnd={handleCompositionEnd}
                            disabled={isLoading || !isAiReady || isCustomActionLocked}
                            placeholder={isCustomActionLocked ? "Hành động tùy ý đã bị khóa bởi một luật lệ" : "Ví dụ: nhặt hòn đá lên..."}
                            className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl py-2 px-3 text-white placeholder-white/50 focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            inputMode="text"
                        />
                        <button 
                            onClick={handleSuggestAction}
                            disabled={isLoading || !isAiReady}
                            className="px-3 py-2 bg-gradient-to-r from-yellow-500/30 to-orange-500/30 hover:from-yellow-500/40 hover:to-orange-500/40 border border-yellow-400/40 rounded-xl text-yellow-200 hover:text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
                            aria-label="Gợi ý hành động"
                        >
                            <SparklesIcon className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={handleSendAction}
                            disabled={isLoading || !isAiReady || isCustomActionLocked || isHighTokenCooldown}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 hover:from-cyan-500/40 hover:to-blue-500/40 border border-cyan-400/40 rounded-xl text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm text-sm"
                            aria-label="Gửi hành động"
                        >
                            {isHighTokenCooldown ? `Chờ ${cooldownTimeLeft}s` : 'Gửi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

FloatingChoicePanel.displayName = 'FloatingChoicePanel';