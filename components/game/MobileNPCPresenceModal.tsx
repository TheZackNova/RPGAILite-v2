import React from 'react';
import type { NPCPresent, Entity } from '../types';

export const MobileNPCPresenceModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    npcsPresent: NPCPresent[];
    knownEntities: { [name: string]: Entity };
}> = ({ isOpen, onClose, npcsPresent, knownEntities }) => {
    if (!isOpen) return null;

    return (
        <div className="md:hidden fixed inset-0 bg-black/60 z-[70] flex items-end" onClick={onClose}>
            <div
                className="w-full bg-white/95 dark:bg-[#1f2238]/95 backdrop-blur-sm p-4 pt-3 rounded-t-2xl shadow-2xl transition-transform transform translate-y-0"
                style={{ animation: 'slideUp 0.3s ease-out' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-3"></div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600 dark:text-blue-400 text-center">NPC hiện tại</h3>
                 <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
                    {npcsPresent.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                            <p>Không có NPC nào được phát hiện trong bối cảnh hiện tại.</p>
                        </div>
                    ) : (
                        npcsPresent.map((npc, index) => (
                            <div key={index} className="bg-slate-100 dark:bg-slate-700 rounded-lg p-3 border border-slate-300 dark:border-slate-600">
                                <div className="mb-2">
                                    <h4 className="font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                                        {npc.name}
                                        {npc.inner_thoughts && !knownEntities[npc.name] && (
                                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 text-xs rounded-full border border-yellow-500/30">
                                                Mới
                                            </span>
                                        )}
                                    </h4>
                                    {(npc.gender || npc.age) && (
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                            {[npc.gender, npc.age].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                </div>
                                
                                {npc.appearance && (
                                    <div className="mb-2">
                                        <p className="text-sm text-slate-700 dark:text-slate-300">
                                            <span className="font-medium">Ngoại hình:</span> {npc.appearance}
                                        </p>
                                    </div>
                                )}
                                
                                {npc.description && (
                                    <div className="mb-2">
                                        <p className="text-sm text-slate-700 dark:text-slate-300">
                                            <span className="font-medium">Mô tả:</span> {npc.description}
                                        </p>
                                    </div>
                                )}
                                
                                {npc.relationship && (
                                    <div className="mb-2">
                                        <p className="text-sm text-slate-700 dark:text-slate-300">
                                            <span className="font-medium">Mối quan hệ:</span> {npc.relationship}
                                        </p>
                                    </div>
                                )}
                                
                                {npc.inner_thoughts && (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300">
                                            💭 Suy nghĩ nội tâm
                                        </summary>
                                        <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400 rounded-r-md">
                                            <p className="text-sm text-purple-800 dark:text-purple-300 italic">
                                                "{npc.inner_thoughts}"
                                            </p>
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))
                    )}
                    {npcsPresent.length > 2 && (
                        <div className="text-center py-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                📜 Cuộn để xem thêm NPC
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