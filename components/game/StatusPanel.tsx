// components/game/StatusPanel.tsx
import React, { memo, useState, useMemo } from 'react';
import { OptimizedInteractiveText } from '../OptimizedInteractiveText';
import type { Entity, Status, Quest, KnownEntities } from '../types';

interface StatusPanelProps {
    pcEntity?: Entity;
    pcStatuses: Status[];
    displayParty: Entity[];
    playerInventory: Entity[];
    quests: Quest[];
    knownEntities: KnownEntities;
    onEntityClick: (entityName: string) => void;
    onStatusClick: (status: Status) => void;
    onDeleteStatus: (statusName: string, entityName: string) => void;
    className?: string;
}

interface TabProps {
    id: string;
    label: string;
    icon: string;
    count?: number;
}

export const StatusPanel: React.FC<StatusPanelProps> = memo(({
    pcEntity,
    pcStatuses,
    displayParty,
    playerInventory,
    quests,
    knownEntities,
    onEntityClick,
    onStatusClick,
    onDeleteStatus,
    className = ''
}) => {
    const [activeTab, setActiveTab] = useState<'character' | 'party' | 'quests'>('character');

    // Calculate tabs data
    const tabs: TabProps[] = useMemo(() => [
        {
            id: 'character',
            label: 'Nhân vật',
            icon: '👤',
            count: pcStatuses.length + playerInventory.length
        },
        {
            id: 'party',
            label: 'Đồng đội',
            icon: '🤝',
            count: displayParty.length
        },
        {
            id: 'quests',
            label: 'Nhiệm vụ',
            icon: '📋',
            count: quests.length
        }
    ], [pcStatuses.length, playerInventory.length, displayParty.length, quests.length]);

    // Helper function to get fame color
    const getFameColor = (fame: string): string => {
        const fameLevel = fame.toLowerCase();
        if (fameLevel.includes('nổi tiếng') || fameLevel.includes('danh gia') || fameLevel.includes('huyền thoại')) {
            return 'text-purple-300 font-semibold';
        } else if (fameLevel.includes('khét tiếng') || fameLevel.includes('ác danh')) {
            return 'text-red-300 font-semibold';
        } else if (fameLevel.includes('tốt') || fameLevel.includes('cao')) {
            return 'text-green-300 font-semibold';
        }
        return 'text-white/70';
    };

    // Utility function to format numbers properly
    const formatNumber = (value: number): string => {
        if (value === 0) return '0';
        return value.toLocaleString().replace(/,$/, '');
    };

    // Render character sheet content
    const renderCharacterSheet = () => {
        if (!pcEntity) {
            return (
                <div className="text-center py-8">
                    <div className="text-4xl mb-4">👤</div>
                    <p className="text-white/60">Không có thông tin nhân vật</p>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {/* Basic Info */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-xl flex items-center justify-center text-2xl">
                                👤
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white cursor-pointer hover:text-blue-300 transition-colors"
                                    onClick={() => onEntityClick(pcEntity.name)}>
                                    {pcEntity.name}
                                </h3>
                                <p className="text-sm text-white/60">Nhân vật chính</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 text-sm">
                        <p><strong className="text-white/90 w-20 inline-block">Tên:</strong> <span className="text-white/80">{pcEntity.name}</span></p>
                        {pcEntity.gender && <p><strong className="text-white/90 w-20 inline-block">Giới tính:</strong> <span className="text-white/80">{pcEntity.gender}</span></p>}
                        {pcEntity.age && <p><strong className="text-white/90 w-20 inline-block">Tuổi:</strong> <span className="text-white/80">{pcEntity.age}</span></p>}
                        {pcEntity.location && <p><strong className="text-white/90 w-20 inline-block">Vị trí:</strong> <span className="text-white/80">{pcEntity.location}</span></p>}
                        
                        {/* Enhanced Appearance */}
                        {pcEntity.appearance && (
                            <div>
                                <strong className="text-white/90">Dung mạo:</strong>
                                <p className="pl-2 mt-1 text-sm text-white/70">{pcEntity.appearance}</p>
                            </div>
                        )}
                        
                        {/* Enhanced Realm with color */}
                        {pcEntity.realm && (
                            <p>
                                <strong className="text-white/90 w-20 inline-block">Thực lực:</strong> 
                                <span className="text-cyan-300 font-semibold">{pcEntity.realm}</span>
                            </p>
                        )}
                        
                        {/* Experience Points */}
                        {pcEntity.currentExp !== undefined && (
                            <p>
                                <strong className="text-white/90 w-20 inline-block">Kinh nghiệm:</strong> 
                                <span className="text-blue-300 font-semibold">{formatNumber(pcEntity.currentExp)}</span>
                            </p>
                        )}
                        
                        {/* Enhanced Fame with color coding */}
                        <div>
                            <strong className="text-white/90">Danh vọng:</strong>
                            {pcEntity.fame ? (
                                <span className={`ml-2 ${getFameColor(pcEntity.fame)}`}>{pcEntity.fame}</span>
                            ) : (
                                <span className="ml-2 text-white/50 italic">Chưa có danh tiếng</span>
                            )}
                        </div>
                        
                        {/* Personality */}
                        {pcEntity.personality && (
                            <div>
                                <strong className="text-white/90">Tính cách (Bề ngoài):</strong>
                                <p className="pl-2 mt-1 text-sm text-white/70">{pcEntity.personality}</p>
                            </div>
                        )}
                        
                        {/* Core Personality (MBTI) */}
                        {pcEntity.personalityMbti && (
                            <div>
                                <strong className="text-white/90">Tính cách (Cốt lõi):</strong>
                                <p className="pl-2 mt-1 text-sm text-white/70">
                                    <span className="text-white/80">{pcEntity.personalityMbti}</span>
                                </p>
                            </div>
                        )}
                        
                        {/* Motivation */}
                        {pcEntity.motivation && (
                            <div>
                                <strong className="text-white/90">Động cơ:</strong>
                                <p className="pl-2 mt-1 text-sm text-white/70">{pcEntity.motivation}</p>
                            </div>
                        )}

                        {/* Character Description */}
                        {pcEntity.description && (
                            <div>
                                <strong className="text-white/90">Mô tả:</strong>
                                <div className="pl-2 mt-1">
                                    <OptimizedInteractiveText
                                        text={pcEntity.description}
                                        onEntityClick={onEntityClick}
                                        knownEntities={knownEntities}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Skills & Learned Skills */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                        🛡️ Kỹ năng & Công pháp
                    </h4>
                    
                    {/* Learned Skills */}
                    {pcEntity.learnedSkills && pcEntity.learnedSkills.length > 0 ? (
                        <div className="space-y-2 mb-4">
                            <p className="text-xs text-white/60 mb-2">Kỹ năng đã học:</p>
                            {pcEntity.learnedSkills.map((skill, index) => (
                                <div key={index} 
                                     className="bg-white/5 border border-white/10 rounded-lg p-2 cursor-pointer hover:bg-white/10 transition-colors"
                                     onClick={() => onEntityClick(skill)}>
                                    <span className="text-sm text-white/90">{skill}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {/* Regular Skills */}
                    {pcEntity.skills && pcEntity.skills.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-white/60 mb-2">Kỹ năng khác:</p>
                            {pcEntity.skills.map((skill, index) => (
                                <div key={index} 
                                     className="bg-white/5 border border-white/10 rounded-lg p-2 cursor-pointer hover:bg-white/10 transition-colors"
                                     onClick={() => onEntityClick(skill)}>
                                    <span className="text-sm text-white/90">{skill}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {(!pcEntity.learnedSkills || pcEntity.learnedSkills.length === 0) && 
                     (!pcEntity.skills || pcEntity.skills.length === 0) && (
                        <p className="text-sm text-white/60 italic">Chưa học được kỹ năng nào.</p>
                    )}
                </div>

                {/* Character Statuses */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                        ⚡ Trạng thái hiện tại ({pcStatuses.length})
                    </h4>
                    {pcStatuses.length > 0 ? (
                        <div className="space-y-2">
                            {pcStatuses.map((status, index) => (
                                <div key={index} 
                                     className="group bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-grow cursor-pointer" onClick={() => onStatusClick(status)}>
                                            <h5 className="text-sm font-medium text-white/90 mb-1">{status.name}</h5>
                                            {status.description && (
                                                <p className="text-xs text-white/60">{status.description}</p>
                                            )}
                                            {status.turns !== undefined && (
                                                <p className="text-xs text-blue-300 mt-1">Còn lại: {status.turns} lượt</p>
                                            )}
                                            {status.duration && status.duration !== 'permanent' && (
                                                <p className="text-xs text-blue-300 mt-1">({status.duration})</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteStatus(status.name, status.owner || 'pc');
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all ml-2"
                                            title="Xóa trạng thái"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <p className="text-sm text-white/60 italic text-center">
                                Đang trong tình trạng bình thường
                            </p>
                        </div>
                    )}
                </div>

                {/* Player Inventory */}
                {playerInventory.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                            🎒 Túi đồ ({playerInventory.length})
                        </h4>
                        <div className="grid grid-cols-1 gap-2">
                            {playerInventory.map((item, index) => (
                                <div key={index} 
                                     className="bg-white/5 border border-white/10 rounded-lg p-2 cursor-pointer hover:bg-white/10 transition-colors"
                                     onClick={() => onEntityClick(item.name)}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">📦</span>
                                        <div className="flex-grow">
                                            <p className="text-sm font-medium text-white/90">{item.name}</p>
                                            {item.description && (
                                                <p className="text-xs text-white/60 line-clamp-1">{item.description.substring(0, 50)}...</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Render party content
    const renderParty = () => {
        if (displayParty.length === 0) {
            return (
                <div className="text-center py-8">
                    <div className="text-4xl mb-4">🤝</div>
                    <p className="text-white/60">Chưa có đồng đội nào</p>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {displayParty.map((member, index) => (
                    <div key={index} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-green-500/30 to-blue-500/30 rounded-lg flex items-center justify-center text-xl">
                                👥
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-white cursor-pointer hover:text-green-300 transition-colors"
                                    onClick={() => onEntityClick(member.name)}>
                                    {member.name}
                                </h4>
                                <p className="text-sm text-white/60">{member.type}</p>
                            </div>
                        </div>

                        {member.description && (
                            <div className="mb-3">
                                <OptimizedInteractiveText
                                    text={member.description}
                                    onEntityClick={onEntityClick}
                                    knownEntities={knownEntities}
                                />
                            </div>
                        )}

                        {member.skills && member.skills.length > 0 && (
                            <div>
                                <p className="text-xs text-white/60 mb-2">Kỹ năng:</p>
                                <div className="flex flex-wrap gap-1">
                                    {member.skills.map((skill, skillIndex) => (
                                        <span key={skillIndex} 
                                              className="text-xs bg-white/10 px-2 py-1 rounded cursor-pointer hover:bg-white/20 transition-colors"
                                              onClick={() => onEntityClick(skill)}>
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    // Render quests content
    const renderQuests = () => {
        if (quests.length === 0) {
            return (
                <div className="text-center py-8">
                    <div className="text-4xl mb-4">📋</div>
                    <p className="text-white/60">Chưa có nhiệm vụ nào</p>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {quests.map((quest, index) => (
                    <div key={index} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                            <h4 className="text-base font-bold text-white">{quest.title}</h4>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                                quest.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                                quest.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                                'bg-yellow-500/20 text-yellow-300'
                            }`}>
                                {quest.status === 'completed' ? 'Hoàn thành' :
                                 quest.status === 'failed' ? 'Thất bại' : 'Đang tiến hành'}
                            </span>
                        </div>

                        {quest.description && (
                            <div className="mb-3">
                                <OptimizedInteractiveText
                                    text={quest.description}
                                    onEntityClick={onEntityClick}
                                    knownEntities={knownEntities}
                                />
                            </div>
                        )}

                        {quest.objectives && quest.objectives.length > 0 && (
                            <div>
                                <p className="text-xs text-white/60 mb-2">Mục tiêu:</p>
                                <ul className="space-y-1">
                                    {quest.objectives.map((objective, objIndex) => (
                                        <li key={objIndex} className="text-sm text-white/80 flex items-start gap-2">
                                            <span className={`mt-1 ${objective.completed ? 'text-green-400' : 'text-blue-300'}`}>
                                                {objective.completed ? '✓' : '•'}
                                            </span>
                                            <span className={objective.completed ? 'line-through text-white/60' : ''}>
                                                {objective.description}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={`flex flex-col bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl h-full ${className}`}>
            {/* Tab Header */}
            <div className="flex-shrink-0 border-b border-white/10">
                <div className="flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 p-4 text-sm font-medium transition-all duration-300 ${
                                activeTab === tab.id
                                    ? 'bg-white/10 text-white border-b-2 border-blue-400'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-lg">{tab.icon}</span>
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <span className="bg-white/20 text-xs px-2 py-1 rounded-full">
                                        {tab.count}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-grow overflow-hidden">
                <div className="h-full overflow-y-auto p-4">
                    {activeTab === 'character' && renderCharacterSheet()}
                    {activeTab === 'party' && renderParty()}
                    {activeTab === 'quests' && renderQuests()}
                </div>
            </div>
        </div>
    );
});

StatusPanel.displayName = 'StatusPanel';