
import React from 'react';

export const MobileChoicesModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    choices: string[];
    onAction: (action: string) => void;
    isHighTokenCooldown?: boolean;
}> = ({ isOpen, onClose, choices, onAction, isHighTokenCooldown = false }) => {
    if (!isOpen) return null;

    const normalizeChoiceText = (choice: unknown) => {
        if (typeof choice === 'string') {
            return choice;
        }

        if (typeof choice === 'number' || typeof choice === 'boolean') {
            return String(choice);
        }

        if (choice && typeof choice === 'object') {
            const candidate = (choice as Record<string, unknown>).text ?? (choice as Record<string, unknown>).label ?? (choice as Record<string, unknown>).choice;
            return typeof candidate === 'string' ? candidate : '';
        }

        return '';
    };

    return (
        <div className="md:hidden fixed inset-0 bg-black/60 z-[70] flex items-end" onClick={onClose}>
            <div
                className="w-full bg-white/95 dark:bg-[#1f2238]/95 backdrop-blur-sm p-4 pt-3 rounded-t-2xl shadow-2xl transition-transform transform translate-y-0"
                style={{ animation: 'slideUp 0.3s ease-out' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-3"></div>
                <h3 className="text-lg font-semibold mb-3 text-cyan-600 dark:text-cyan-400 text-center">Lựa chọn hành động</h3>
                 <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2">
                    {choices.map((choice, index) => (
                        (() => {
                            const choiceText = normalizeChoiceText(choice);
                            return (
                        <button
                            key={index}
                            onClick={() => {
                                onAction(choiceText);
                                onClose();
                            }}
                            disabled={isHighTokenCooldown}
                            className={`w-full text-left p-3 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-gray-200 rounded-md transition-colors duration-200 shadow-sm border border-slate-300 dark:border-slate-600 ${
                                isHighTokenCooldown 
                                    ? 'opacity-50 cursor-not-allowed' 
                                    : 'hover:bg-purple-600 dark:hover:bg-purple-600 hover:text-white'
                            }`}
                        >
                             {choiceText.match(/^\d+\.\s/) ? choiceText : `${index + 1}. ${choiceText}`}
                        </button>
                            );
                        })()
                    ))}
                    {choices.length > 4 && (
                        <div className="text-center py-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                📜 Cuộn để xem thêm lựa chọn
                            </p>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="w-full mt-4 py-2.5 bg-slate-600 text-white rounded-md font-semibold">Đóng</button>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};
