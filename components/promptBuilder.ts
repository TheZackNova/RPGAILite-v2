import type { SaveData, Entity, Status, Quest, GameHistoryEntry, CustomRule, KnownEntities } from './types.ts';
import { MBTI_PERSONALITIES } from './data/mbti.ts';
import { EnhancedRAG } from './utils/EnhancedRAG';
import { MemoryAnalytics } from './utils/MemoryAnalytics';
import { ReferenceBasedRAG, type CompactRAGContext } from './utils/ReferenceBasedRAG';
import { ruleActivationEngine, type ActivationContext } from './utils/RuleActivationEngine';

// Aggressive Token Management for 100k hard limit
const TOKEN_CONFIG = {
    MAX_TOKENS_PER_TURN: 90000,  // 90k hard limit with 10k buffer
    TOKEN_BUFFER: 10000,         // 10k safety buffer
    CHARS_PER_TOKEN: 1.2,        // Conservative token estimation
    
    // Aggressive allocation for strict 100k budget
    ALLOCATION: {
        CRITICAL: 0.50,      // 45k tokens - Party, action context only
        IMPORTANT: 0.25,     // 22.5k tokens - Essential entities, key quests
        CONTEXTUAL: 0.15,    // 13.5k tokens - Minimal world info
        SUPPLEMENTAL: 0.10   // 9k tokens - Rules, misc (reduced)
    },
    
    // Reference-based RAG settings
    USE_REFERENCE_RAG: true,     // Enable reference-based RAG for token efficiency
    REFERENCE_RAG_TOKEN_LIMIT: 600  // Max tokens for reference-based context
};

// Entity relevance scoring
interface EntityRelevance {
    entity: Entity;
    score: number;
    reason: string[];
}

// Memory with relevance scoring
interface ScoredMemory {
    memory: string;
    score: number;
    type: 'turn' | 'chapter' | 'memoir';
}

export class EnhancedRAGSystem {
    private semanticCache = new Map<string, Set<string>>();
    private entityGraph = new Map<string, Set<string>>();
    private currentGameState?: SaveData; // Store current game state for choice context
    
    constructor() {
        this.initializeSystem();
    }

    private initializeSystem() {
        // Initialize any preprocessing needed
    }

    // Main entry point - builds the enhanced RAG prompt
    public buildEnhancedPrompt(
        action: string,
        gameState: SaveData,
        ruleChangeContext: string = '',
        playerNsfwRequest: string = ''
    ): string {
        const startTime = performance.now();
        
        // Defensive check for gameState
        if (!gameState) {
            console.error('🚨 buildEnhancedPrompt: gameState is null/undefined, using fallback');
            return `Hành động: ${action}\nTrạng thái: Lỗi hệ thống, không thể xử lý gameState.`;
        }
        
        try {
            // Store current game state for choice context
            this.currentGameState = gameState;
            
            // Step 1: Choose RAG strategy based on configuration
            let intelligentContext;
            let compactContext: CompactRAGContext | null = null;
            
            if (TOKEN_CONFIG.USE_REFERENCE_RAG) {
                // Use Reference-based RAG for token efficiency
                compactContext = ReferenceBasedRAG.buildCompactContext(gameState, action, {
                    maxMemories: 6,
                    maxTokens: TOKEN_CONFIG.REFERENCE_RAG_TOKEN_LIMIT,
                    importanceThreshold: 35,
                    recencyWeight: 0.3,
                    relevanceWeight: 0.5,
                    diversityWeight: 0.2,
                    includeArchived: false
                });
                
                // No traditional context needed when using reference RAG
                intelligentContext = null;
            } else {
                // Use traditional Enhanced RAG
                intelligentContext = EnhancedRAG.buildIntelligentContext(gameState, action, {
                    maxMemories: 5,
                    maxTokens: 1000,
                    importanceThreshold: 35,
                    recencyWeight: 0.3,
                    relevanceWeight: 0.5,
                    diversityWeight: 0.2,
                    includeArchived: false
                });
            }
            
            // Step 2: Analyze action intent
            const actionIntent = this.analyzeActionIntent(action);
            
            // Step 3: Build entity relationship graph
            this.buildEntityGraph(gameState.knownEntities);
            
            // Step 4: Score and retrieve relevant entities (enhanced with context)
            const relevantEntities = compactContext ? 
                // Use entity references from compact context when available
                compactContext.entityReferences.map(ref => ({
                    entity: ReferenceBasedRAG.getEntityByReference(ref.referenceId) || ref as any,
                    score: ref.relevanceScore,
                    reason: [`Reference: ${ref.referenceId}`]
                })).filter(e => e.entity) :
                // Traditional entity retrieval as fallback
                this.retrieveRelevantEntities(
                    action,
                    actionIntent,
                    gameState,
                    intelligentContext
                );
            
            // Step 5: Calculate dynamic token budgets (accounting for context type)
            const contextTokenUsage = compactContext ? 
                (compactContext.originalTokens - compactContext.tokensSaved) : 
                (intelligentContext?.tokenUsage || 0);
            const tokenBudget = this.calculateDynamicTokenBudget(
                relevantEntities,
                gameState,
                contextTokenUsage
            );
            
            // Step 5: Build context sections with priority
            const contextSections = this.buildPrioritizedContext(
                relevantEntities,
                gameState,
                tokenBudget,
                action
            );
            
            // Step 6: Assemble final prompt with appropriate context
            const finalPrompt = this.assembleFinalPrompt(
                action,
                contextSections,
                ruleChangeContext,
                playerNsfwRequest,
                gameState.worldData,
                intelligentContext,
                compactContext,
                gameState
            );
            
            const endTime = performance.now();
            console.log(`RAG processing time: ${(endTime - startTime).toFixed(2)}ms`);
            
            return this.enforceTokenLimit(finalPrompt);
            
        } catch (error) {
            console.error('Enhanced RAG Error:', error);
            // Fallback to basic prompt
            return this.buildFallbackPrompt(action, gameState);
        }
    }

    // Analyze the player's action to understand intent
    private analyzeActionIntent(action: string): ActionIntent {
        const lowerAction = action.toLowerCase();
        const intent: ActionIntent = {
            type: 'general',
            targets: [],
            keywords: [],
            isMovement: false,
            isCombat: false,
            isSocial: false,
            isItemUse: false,
            isSkillUse: false,
            isExploration: false
        };

        // Movement patterns
        if (/đi|chạy|leo|nhảy|bay|di chuyển|tới|đến|rời|về/.test(lowerAction)) {
            intent.isMovement = true;
            intent.type = 'movement';
        }

        // Combat patterns
        if (/tấn công|đánh|chém|đâm|bắn|ném|chiến đấu|giết/.test(lowerAction)) {
            intent.isCombat = true;
            intent.type = 'combat';
        }

        // Social patterns
        if (/nói|hỏi|trả lời|thuyết phục|dọa|giao dịch|mua|bán/.test(lowerAction)) {
            intent.isSocial = true;
            intent.type = 'social';
        }

        // Item use patterns
        if (/sử dụng|dùng|uống|ăn|trang bị|tháo|cho|lấy/.test(lowerAction)) {
            intent.isItemUse = true;
            intent.type = 'item_interaction';
        }

        // Skill use patterns
        if (/thi triển|sử dụng.*pháp|công pháp|kỹ năng/.test(lowerAction)) {
            intent.isSkillUse = true;
            intent.type = 'skill_use';
        }

        // Extract potential entity targets
        intent.targets = this.extractPotentialTargets(action);
        intent.keywords = this.extractKeywords(action);

        return intent;
    }

    // Build entity relationship graph for better retrieval
    private buildEntityGraph(entities: KnownEntities) {
        this.entityGraph.clear();
        
        if (!entities || typeof entities !== 'object') {
            return;
        }
        
        for (const [name, entity] of Object.entries(entities)) {
            const connections = new Set<string>();
            
            // Add connections based on entity properties
            if (entity.owner) connections.add(entity.owner);
            if (entity.location) connections.add(entity.location);
            
            // Parse description for entity mentions
            const description = (entity.description || '').toLowerCase();
            for (const [otherName, otherEntity] of Object.entries(entities)) {
                if (name !== otherName && description.includes(otherName.toLowerCase())) {
                    connections.add(otherName);
                }
            }
            
            // Special handling for NPCs with skills
            if (entity.skills && Array.isArray(entity.skills)) {
                entity.skills.forEach(skill => connections.add(skill));
            }
            
            this.entityGraph.set(name, connections);
        }
    }

    // Enhanced entity retrieval with relevance scoring
    private retrieveRelevantEntities(
        action: string,
        intent: ActionIntent,
        gameState: SaveData,
        intelligentContext?: any
    ): EntityRelevance[] {
        const { knownEntities, party, gameHistory, statuses } = gameState;
        const relevanceScores: EntityRelevance[] = [];
        
        // Always include party members with high relevance
        if (Array.isArray(party)) {
            party.forEach(member => {
                relevanceScores.push({
                    entity: member,
                    score: 100,
                    reason: ['Party member']
                });
            });
        }

        // Score all other entities
        for (const [name, entity] of Object.entries(knownEntities)) {
            if (Array.isArray(party) && party.some(p => p.name === name)) continue;
            
            let score = 0;
            const reasons: string[] = [];
            
            // Direct mention in action
            if (action.toLowerCase().includes(name.toLowerCase())) {
                score += 50;
                reasons.push('Directly mentioned');
            }
            
            // Mentioned in recent history (sliding window)
            const recentMentions = this.countRecentMentions(name, gameHistory, 3);
            if (recentMentions > 0) {
                score += Math.min(30, recentMentions * 10);
                reasons.push(`Recent mentions: ${recentMentions}`);
            }
            
            // Location matching for PC
            const pc = party.find(p => p.type === 'pc');
            if (pc?.location && entity.location === pc.location) {
                score += 20;
                reasons.push('Same location as PC');
            }
            
            // Type relevance based on intent
            score += this.getTypeRelevanceScore(entity.type, intent);
            
            // Enhanced companion skill matching
            if (entity.type === 'companion' && entity.skills) {
                const skillsArray = Array.isArray(entity.skills) ? entity.skills : entity.skills.split(',').map(s => s.trim());
                const skillMatch = this.getCompanionSkillRelevance(skillsArray, action, intent);
                score += skillMatch;
                if (skillMatch > 0) {
                    reasons.push(`Relevant skills: ${skillsArray.slice(0, 2).join(', ')}`);
                }
            }
            
            // Graph connections
            const connections = this.entityGraph.get(name) || new Set();
            const connectedToRelevant = Array.from(connections).some(conn => 
                relevanceScores.some(r => r.score > 50 && r.entity.name === conn)
            );
            if (connectedToRelevant) {
                score += 15;
                reasons.push('Connected to relevant entity');
            }
            
            // Status effects
            if (statuses.some(s => s.owner === name)) {
                score += 10;
                reasons.push('Has active status');
            }
            
            if (score > 0) {
                relevanceScores.push({ entity, score, reason: reasons });
            }
        }
        
        // Sort by relevance (no threshold filtering)
        return relevanceScores
            .sort((a, b) => b.score - a.score);
    }

    // Calculate dynamic token budgets based on context
    private calculateDynamicTokenBudget(
        relevantEntities: EntityRelevance[],
        gameState: SaveData,
        intelligentContextTokens: number = 0
    ): TokenBudget {
        const baseLimit = TOKEN_CONFIG.MAX_TOKENS_PER_TURN - TOKEN_CONFIG.TOKEN_BUFFER;
        
        // Analyze context complexity
        const hasActiveQuests = gameState.quests?.some(q => q.status === 'active') || false;
        const hasComplexHistory = gameState.gameHistory.length > 20;
        const hasManyCriticalEntities = relevantEntities.filter(r => r.score > 70).length > 5;
        
        // Adjust allocations based on context
        let criticalWeight = TOKEN_CONFIG.ALLOCATION.CRITICAL;
        let importantWeight = TOKEN_CONFIG.ALLOCATION.IMPORTANT;
        
        if (hasManyCriticalEntities) {
            criticalWeight += 0.1;
            importantWeight -= 0.05;
        }
        
        if (!hasActiveQuests) {
            importantWeight -= 0.05;
            criticalWeight += 0.05;
        }
        
        return {
            critical: Math.floor(baseLimit * criticalWeight),
            important: Math.floor(baseLimit * importantWeight),
            contextual: Math.floor(baseLimit * TOKEN_CONFIG.ALLOCATION.CONTEXTUAL),
            supplemental: Math.floor(baseLimit * TOKEN_CONFIG.ALLOCATION.SUPPLEMENTAL)
        };
    }

    // Build prioritized context sections
    private buildPrioritizedContext(
        relevantEntities: EntityRelevance[],
        gameState: SaveData,
        budget: TokenBudget,
        playerInput?: string
    ): ContextSections {
        const sections: ContextSections = {
            critical: '',
            important: '',
            contextual: '',
            supplemental: ''
        };

        // Critical: All entities and immediate context (no filtering by score)
        sections.critical = this.buildCriticalContext(
            relevantEntities,
            gameState,
            budget.critical
        );

        // Important: Additional context, active quests, recent history
        sections.important = this.buildImportantContext(
            relevantEntities,
            gameState,
            budget.important
        );

        // Contextual: World info, chronicle, memories
        sections.contextual = this.buildContextualInfo(
            gameState,
            budget.contextual
        );

        // Supplemental: Custom rules and additional context (enhanced with new activation engine)
        sections.supplemental = this.buildSupplementalContext(
            gameState,
            relevantEntities,
            budget.supplemental,
            playerInput
        );

        return sections;
    }

    // Helper methods for context building
    private buildCriticalContext(
        entities: EntityRelevance[],
        gameState: SaveData,
        tokenBudget: number
    ): string {
        let context = "=== TRI THỨC QUAN TRỌNG ===\n";
        let usedTokens = this.estimateTokens(context);
        
        // Add Vietnamese choice instructions at the beginning of critical context
        const choiceInstructions = this.buildCoreGameInstructions();
        context += "\n" + choiceInstructions + "\n\n";
        usedTokens += this.estimateTokens(choiceInstructions);
        
        // Add time and turn info
        const timeInfo = this.formatGameTime(gameState.gameTime, gameState.turnCount);
        context += timeInfo + "\n\n";
        usedTokens += this.estimateTokens(timeInfo);
        
        // Dedicated party section for enhanced coordination  
        const partyContext = this.buildEnhancedPartyContext(gameState, Math.floor(tokenBudget * 0.4));
        if (partyContext) {
            context += partyContext + "\n";
            usedTokens += this.estimateTokens(partyContext);
        }
        
        // Add remaining entities with detailed info (no filtering by type)
        const remainingBudget = tokenBudget - usedTokens;
        const nonPartyEntities = entities.filter(e => e.entity.type !== 'companion');
        const tokensPerEntity = Math.floor(remainingBudget / Math.max(1, nonPartyEntities.length));
        
        nonPartyEntities.forEach(({ entity, score, reason }) => {
            const entityText = this.formatEntityWithContext(
                entity,
                gameState.statuses,
                reason,
                tokensPerEntity,
                gameState
            );
            
            const entityTokens = this.estimateTokens(entityText);
            if (usedTokens + entityTokens <= tokenBudget) {
                context += entityText + "\n";
                usedTokens += entityTokens;
            }
        });
        
        return context;
    }
    
    // Enhanced party coordination context for better AI understanding
    private buildEnhancedPartyContext(gameState: SaveData, maxTokens: number): string {
        const { party, statuses } = gameState;
        
        if (!party || party.length === 0) return '';
        
        let context = "**TỔ ĐỘI PHIỀU LƯU:**\n";
        let usedTokens = this.estimateTokens(context);
        
        // Log AI context building for debugging
        if (gameState.turnCount) {
            import('./utils/partyDebugger').then(({ partyDebugger }) => {
                partyDebugger.logAIContextBuild({
                    companions: party.filter(p => p.type === 'companion'),
                    contextLength: context.length,
                    includesPersonalities: party.some(p => p.personality),
                    includesSkills: party.some(p => p.skills),
                    includesRelationships: party.some(p => p.relationship)
                }, usedTokens, gameState.turnCount);
            });
        }
        
        // PC information first
        const pc = party.find(p => p.type === 'pc');
        if (pc) {
            const pcStatuses = statuses.filter(s => s.owner === 'pc' || s.owner === pc.name);
            let pcInfo = `[Nhân vật chính] ${pc.name}`;
            
            const pcDetails: string[] = [];
            // EMPHASIZE MOTIVATION FIRST
            if (pc.motivation) pcDetails.push(`**MỤC TIÊU**: ${pc.motivation}`);
            if (pc.location) pcDetails.push(`Vị trí: ${pc.location}`);
            if (pc.realm) pcDetails.push(`Thực lực: ${pc.realm}`);
            if (pc.learnedSkills && pc.learnedSkills.length > 0) {
                const skillsWithMastery = pc.learnedSkills.map(skillName => {
                    const skillEntity = Object.values(gameState.knownEntities).find((e: any) => e.name === skillName && e.type === 'skill');
                    if (skillEntity && skillEntity.mastery) {
                        return `${skillName} (${skillEntity.mastery})`;
                    }
                    return skillName;
                });
                pcDetails.push(`Kỹ năng: ${skillsWithMastery.join(', ')}`);
            }
            if (pcStatuses.length > 0) {
                pcDetails.push(`Trạng thái: ${pcStatuses.map(s => s.name).join(', ')}`);
            }
            
            if (pcDetails.length > 0) {
                pcInfo += ` - ${pcDetails.join(', ')}`;
            }
            pcInfo += '\n';
            
            const pcTokens = this.estimateTokens(pcInfo);
            if (usedTokens + pcTokens <= maxTokens) {
                context += pcInfo;
                usedTokens += pcTokens;
            }
        }
        
        // Companions with detailed coordination info
        const companions = party.filter(p => p.type === 'companion');
        if (companions.length > 0) {
            companions.forEach(companion => {
                let companionInfo = `[Đồng hành] ${companion.name}`;
                
                const companionDetails: string[] = [];
                
                // Relationship status (critical for party dynamics)
                if (companion.relationship) {
                    companionDetails.push(`Quan hệ: ${companion.relationship}`);
                }
                
                // Power level for tactical coordination
                if (companion.realm) {
                    companionDetails.push(`Cảnh giới: ${companion.realm}`);
                }
                
                // Key skills for party synergy
                if (companion.skills && companion.skills.length > 0) {
                    const skillsArray = Array.isArray(companion.skills) ? companion.skills : companion.skills.split(',').map(s => s.trim());
                    companionDetails.push(`Chuyên môn: ${skillsArray.slice(0, 2).join(', ')}`);
                }
                
                // Active status effects
                const companionStatuses = statuses.filter(s => s.owner === companion.name);
                if (companionStatuses.length > 0) {
                    companionDetails.push(`Trạng thái: ${companionStatuses.map(s => s.name).join(', ')}`);
                }
                
                // Core personality for AI roleplay
                if (companion.personality) {
                    const personalitySnippet = companion.personality.length > 50 
                        ? companion.personality.substring(0, 50) + '...' 
                        : companion.personality;
                    companionDetails.push(`Tính cách: ${personalitySnippet}`);
                }
                
                if (companionDetails.length > 0) {
                    companionInfo += ` - ${companionDetails.join(', ')}`;
                }
                companionInfo += '\n';
                
                const companionTokens = this.estimateTokens(companionInfo);
                if (usedTokens + companionTokens <= maxTokens) {
                    context += companionInfo;
                    usedTokens += companionTokens;
                }
            });
            
            // Party coordination notes
            const coordNote = "\n*Lưu ý: Hãy chú trọng đến sự tương tác và phối hợp giữa các thành viên trong tổ đội. Mỗi đồng hành có cá tính và kỹ năng riêng, hãy thể hiện điều này trong câu chuyện.*\n";
            const noteTokens = this.estimateTokens(coordNote);
            if (usedTokens + noteTokens <= maxTokens) {
                context += coordNote;
            }
        }
        
        return context;
    }

    private buildImportantContext(
        entities: EntityRelevance[],
        gameState: SaveData,
        tokenBudget: number
    ): string {
        let context = "\n=== THÔNG TIN LIÊN QUAN ===\n";
        let usedTokens = this.estimateTokens(context);
        
        // Active quests
        const questContext = this.buildQuestContext(
            (gameState.quests || []).filter(q => q.status === 'active'),
            Math.floor(tokenBudget * 0.3)
        );
        context += questContext;
        usedTokens += this.estimateTokens(questContext);
        
        // Recent history with smart summarization
        const historyContext = this.buildSmartHistoryContext(
            gameState.gameHistory,
            Math.floor(tokenBudget * 0.4)
        );
        context += historyContext;
        usedTokens += this.estimateTokens(historyContext);
        
        // Related entities
        const remainingBudget = tokenBudget - usedTokens;
        const tokensPerEntity = Math.floor(remainingBudget / Math.max(1, entities.length));
        
        entities.forEach(({ entity, reason }) => {
            const entityText = this.formatEntityBrief(entity, reason, tokensPerEntity);
            const entityTokens = this.estimateTokens(entityText);
            
            if (usedTokens + entityTokens <= tokenBudget) {
                context += entityText + "\n";
                usedTokens += entityTokens;
            }
        });
        
        return context;
    }

    // Utility methods
    private estimateTokens(text: string): number {
        return Math.ceil(text.length * TOKEN_CONFIG.CHARS_PER_TOKEN);
    }

    private countRecentMentions(name: string, history: GameHistoryEntry[], lookback: number): number {
        const recentEntries = history.slice(-lookback * 2); // User + model entries
        let count = 0;
        
        recentEntries.forEach(entry => {
            const text = entry.parts[0].text.toLowerCase();
            const regex = new RegExp(`\\b${name.toLowerCase()}\\b`, 'g');
            const matches = text.match(regex);
            count += matches ? matches.length : 0;
        });
        
        return count;
    }

    private getTypeRelevanceScore(type: string, intent: ActionIntent): number {
        const relevanceMatrix: Record<string, Record<string, number>> = {
            'combat': { 'npc': 20, 'item': 15, 'skill': 25, 'companion': 35 }, // Higher for companions in combat
            'social': { 'npc': 30, 'companion': 40, 'faction': 20 }, // Companions excel in social situations
            'item_interaction': { 'item': 30, 'skill': 10, 'companion': 15 }, // Companions may have opinions
            'movement': { 'location': 30, 'npc': 10, 'companion': 25 }, // Companions travel together
            'skill_use': { 'skill': 40, 'item': 10, 'companion': 30 }, // Companions can assist with skills
            'general': { 'npc': 10, 'item': 10, 'location': 10, 'companion': 20 } // Always include companions
        };
        
        return relevanceMatrix[intent.type]?.[type] || 0;
    }

    // NEW: Enhanced skill relevance scoring for companions
    private getCompanionSkillRelevance(skills: string[], action: string, intent: ActionIntent): number {
        let score = 0;
        const actionLower = action.toLowerCase();
        
        // Combat skill relevance
        const combatSkills = ['chiến đấu', 'tấn công', 'phòng thủ', 'kiếm thuật', 'võ thuật', 'magic', 'pháp thuật'];
        if (intent.isCombat && skills.some(skill => 
            combatSkills.some(combat => skill.toLowerCase().includes(combat)))) {
            score += 25;
        }
        
        // Social skill relevance  
        const socialSkills = ['thuyết phục', 'giao tiếp', 'đàm phán', 'lãnh đạo', 'charm'];
        if (intent.isSocial && skills.some(skill => 
            socialSkills.some(social => skill.toLowerCase().includes(social)))) {
            score += 20;
        }
        
        // Direct skill mention in action
        for (const skill of skills) {
            if (actionLower.includes(skill.toLowerCase())) {
                score += 30;
                break;
            }
        }
        
        // Movement and exploration skills
        const explorationSkills = ['do thám', 'stealth', 'survival', 'navigation', 'tracking'];
        if (intent.isMovement && skills.some(skill => 
            explorationSkills.some(explore => skill.toLowerCase().includes(explore)))) {
            score += 15;
        }
        
        return score;
    }

    private extractPotentialTargets(action: string): string[] {
        // Extract quoted strings and proper nouns
        const targets: string[] = [];
        
        // Extract quoted targets
        const quotedMatches = action.match(/"([^"]+)"/g);
        if (quotedMatches) {
            targets.push(...quotedMatches.map(m => m.replace(/"/g, '')));
        }
        
        // Extract capitalized words (potential entity names)
        const words = action.split(/\s+/);
        words.forEach(word => {
            if (word.length > 2 && /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(word)) {
                targets.push(word);
            }
        });
        
        return [...new Set(targets)];
    }

    private extractKeywords(action: string): string[] {
        const stopWords = new Set(['và', 'của', 'là', 'trong', 'với', 'để', 'đến', 'từ']);
        const words = action.toLowerCase().split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
        
        return [...new Set(words)];
    }

    private formatGameTime(time: any, turnCount?: number): string {
        if (!time) return 'Không xác định';
        
        try {
            const { year, month, day, hour, minute } = time;
            const timeStr = `Năm ${year || '?'} Tháng ${month || '?'} Ngày ${day || '?'}, ${hour || 0} giờ ${minute || 0} phút`;
            return turnCount !== undefined ? `Thời gian: ${timeStr} (Lượt ${turnCount})` : timeStr;
        } catch {
            return 'Lỗi định dạng thời gian';
        }
    }

    // UPDATED: Aggressive truncation for token control
    private aggressiveTruncation(text: string, maxTokens: number): string {
        const estimatedTokens = this.estimateTokens(text);
        
        if (estimatedTokens <= maxTokens) {
            return text;
        }
        
        // Aggressive character limit
        const charLimit = Math.floor(maxTokens / TOKEN_CONFIG.CHARS_PER_TOKEN * 0.9); // 90% safety margin
        
        if (text.length <= charLimit) {
            return text;
        }
        
        // Priority truncation - keep first and last parts
        const keepStart = Math.floor(charLimit * 0.6);
        const keepEnd = Math.floor(charLimit * 0.3);
        
        if (keepStart + keepEnd < text.length) {
            return text.substring(0, keepStart) + "\n...[nội dung đã được rút gọn]...\n" + text.substring(text.length - keepEnd);
        }
        
        return text.substring(0, charLimit) + '...';
    }

    // NEW: Build smart choice generation context
    private buildSmartChoiceContext(
        sections: ContextSections,
        compactContext?: CompactRAGContext | null,
        intelligentContext?: any
    ): string | null {
        if (!this.currentGameState) return null;
        
        const gameState = this.currentGameState;
        let context = "\n--- HƯỚNG DẪN TẠO LỰA CHỌN THÔNG MINH ---\n";
        
        // 1. Choice history context to prevent repetition
        const choiceHistoryContext = this.buildChoiceHistoryContext(gameState);
        if (choiceHistoryContext) {
            context += choiceHistoryContext + "\n";
        }
        
        // 2. Situational context for relevant choices
        const situationalContext = this.buildSituationalChoiceContext(gameState, sections);
        if (situationalContext) {
            context += situationalContext + "\n";
        }
        
        // 3. Party-based choice suggestions
        const partyChoiceContext = this.buildPartyChoiceContext(gameState);
        if (partyChoiceContext) {
            context += partyChoiceContext + "\n";
        }
        
        // 4. Goal-oriented choice context
        const goalContext = this.buildGoalOrientedChoiceContext(gameState);
        if (goalContext) {
            context += goalContext + "\n";
        }
        
        // 5. NEW: Choice diversity guidance
        const diversityContext = this.buildChoiceDiversityContext(gameState);
        if (diversityContext) {
            context += diversityContext + "\n";
        }
        
        context += "**QUAN TRỌNG**: Lựa chọn phải phù hợp với tình huống hiện tại, không lặp lại những gì đã chọn gần đây, và tạo cơ hội phát triển câu chuyện theo hướng thú vị.";
        
        return context;
    }
    
    // Helper method to identify choice patterns for better tracking
    private identifyChoicePatterns(choices: string[]): { type: string, examples: string[] }[] {
        const patterns: { [key: string]: string[] } = {
            'Tấn công/Chiến đấu': [],
            'Giao tiếp/Trò chuyện': [],
            'Di chuyển/Khám phá': [],
            'Quan sát/Theo dõi': [],
            'Sử dụng kỹ năng': [],
            'Tương tác NSFW': [],
            'Nghỉ ngơi/Thư giãn': [],
            'Khác': []
        };
        
        choices.forEach(choice => {
            const lowerChoice = choice.toLowerCase();
            
            if (/tấn công|đánh|chiến đấu|thi triển|công kích/.test(lowerChoice)) {
                patterns['Tấn công/Chiến đấu'].push(choice);
            } else if (/nói|hỏi|trò chuyện|giao tiếp|thuyết phục|tán gẫu/.test(lowerChoice)) {
                patterns['Giao tiếp/Trò chuyện'].push(choice);
            } else if (/đi|di chuyển|về|tới|khám phá|tìm kiếm|rời/.test(lowerChoice)) {
                patterns['Di chuyển/Khám phá'].push(choice);
            } else if (/quan sát|nhìn|theo dõi|xem|kín đáo/.test(lowerChoice)) {
                patterns['Quan sát/Theo dõi'].push(choice);
            } else if (/sử dụng.*kỹ năng|thi triển|pháp thuật|kỹ thuật/.test(lowerChoice)) {
                patterns['Sử dụng kỹ năng'].push(choice);
            } else if (/nsfw|chạm|xoa|âu yếm|gần gũi|tình dục/.test(lowerChoice)) {
                patterns['Tương tác NSFW'].push(choice);
            } else if (/nghỉ|ngơi|thư giãn|tận hưởng|ngâm/.test(lowerChoice)) {
                patterns['Nghỉ ngơi/Thư giãn'].push(choice);
            } else {
                patterns['Khác'].push(choice);
            }
        });
        
        // Return only non-empty patterns
        return Object.entries(patterns)
            .filter(([_, examples]) => examples.length > 0)
            .map(([type, examples]) => ({ type, examples }));
    }
    
    // Build choice history context to avoid repetition - ENHANCED with compressed history
    private buildChoiceHistoryContext(gameState: SaveData): string | null {
        const choiceHistory = gameState.choiceHistory || [];
        const compressedHistory = gameState.compressedHistory || [];
        
        // IMPROVED: Get last 5 turns instead of 3, track selected choices
        const recentEntries = choiceHistory
            .filter(entry => gameState.turnCount - entry.turn <= 5)
            .slice(-5); // Last 5 turn entries
        
        // NEW: Extract choices from compressed history to maintain long-term memory
        const compressedChoices: string[] = [];
        if (compressedHistory.length > 0) {
            // Get choices from the most recent compressed segments
            const recentCompressed = compressedHistory.slice(-2); // Last 2 compressed segments
            recentCompressed.forEach(segment => {
                if (segment.recentChoices) {
                    compressedChoices.push(...segment.recentChoices);
                }
            });
        }
        
        // If no recent entries and no compressed choices, return null
        if (recentEntries.length === 0 && compressedChoices.length === 0) return null;
        
        // Track both available choices AND what was selected
        const selectedChoices = recentEntries
            .filter(entry => entry.selectedChoice)
            .map(entry => entry.selectedChoice)
            .slice(-8); // Last 8 selected choices
            
        const recentChoices = recentEntries
            .flatMap(entry => entry.choices)
            .slice(-15); // Last 15 offered choices
        
        // ENHANCED: Combine recent choices with compressed history choices
        const allChoices = [...compressedChoices, ...recentChoices];
        const uniqueChoices = [...new Set(allChoices)].slice(-20); // Max 20 unique choices
        
        let context = "**TRÁNH LẶP LẠI - Đa dạng hóa lựa chọn:**\n";
        
        if (selectedChoices.length > 0) {
            context += "Hành động đã chọn gần đây:\n";
            selectedChoices.forEach(choice => {
                context += `• ${choice}\n`;
            });
            context += "\n";
        }
        
        if (uniqueChoices.length > 0) {
            context += "Lựa chọn đã đưa ra (bao gồm lịch sử nén - tránh trùng lặp):\n";
            // Group similar choices to show patterns
            const choicePatterns = this.identifyChoicePatterns(uniqueChoices);
            choicePatterns.forEach(pattern => {
                context += `• Nhóm "${pattern.type}": ${pattern.examples.slice(0, 2).join(', ')}${pattern.examples.length > 2 ? '...' : ''}\n`;
            });
            
            // NEW: Show compressed segment info for context
            if (compressedChoices.length > 0) {
                context += `\n*Đã tích hợp ${compressedChoices.length} lựa chọn từ lịch sử nén để tránh lặp lại*\n`;
            }
        }
        
        context += "\n**YÊU CẦU**: Tạo lựa chọn MỚI, KHÁC BIỆT và PHÙ HỢP với tình huống hiện tại!\n";
        return context;
    }
    
    // Build situational context based on current location and entities
    private buildSituationalChoiceContext(gameState: SaveData, sections: ContextSections): string | null {
        const pc = gameState.party?.find(p => p.type === 'pc');
        if (!pc) return null;
        
        let context = "**Tạo lựa chọn phù hợp với tình huống:**\n";
        let suggestions: string[] = [];
        
        // Location-based suggestions
        if (pc.location) {
            const locationEntity = gameState.knownEntities[pc.location];
            if (locationEntity) {
                suggestions.push(`Khai thác đặc điểm của địa điểm "${pc.location}"`);
            }
        }
        
        // Active quest suggestions
        const activeQuests = gameState.quests?.filter(q => q.status === 'active') || [];
        if (activeQuests.length > 0) {
            suggestions.push(`Tạo lựa chọn tiến triển nhiệm vụ: "${activeQuests[0].title}"`);
        }
        
        // Available skills suggestions
        if (pc.learnedSkills && pc.learnedSkills.length > 0) {
            const skillsWithMastery = pc.learnedSkills.map(skillName => {
                const skillEntity = Object.values(gameState.knownEntities).find((e: any) => e.name === skillName && e.type === 'skill');
                if (skillEntity && skillEntity.mastery) {
                    return `${skillName} (${skillEntity.mastery})`;
                }
                return skillName;
            });
            suggestions.push(`Cho phép sử dụng kỹ năng: ${skillsWithMastery.slice(0, 2).join(', ')}`);
        }
        
        // Social interaction suggestions based on nearby NPCs
        const nearbyNPCs = Object.values(gameState.knownEntities)
            .filter(entity => entity.type === 'npc' && entity.location === pc.location)
            .slice(0, 2);
        
        if (nearbyNPCs.length > 0) {
            suggestions.push(`Tương tác với: ${nearbyNPCs.map(npc => npc.name).join(', ')}`);
        }
        
        if (suggestions.length > 0) {
            context += suggestions.map(s => `• ${s}`).join('\n') + '\n';
            return context;
        }
        
        return null;
    }
    
    // Build party-based choice context for companion interactions
    private buildPartyChoiceContext(gameState: SaveData): string | null {
        const companions = gameState.party?.filter(p => p.type === 'companion') || [];
        if (companions.length === 0) return null;
        
        let context = "**Tạo lựa chọn tương tác với đồng hành:**\n";
        let suggestions: string[] = [];
        
        companions.forEach(companion => {
            // Suggest choices based on companion's skills and personality
            if (companion.skills && companion.skills.length > 0) {
                const skillsArray = Array.isArray(companion.skills) ? companion.skills : companion.skills.split(',').map(s => s.trim());
                suggestions.push(`Nhờ ${companion.name} sử dụng chuyên môn: ${skillsArray[0]}`);
            }
            
            // Relationship-based suggestions
            if (companion.relationship) {
                suggestions.push(`Trao đổi với ${companion.name} dựa trên mối quan hệ: ${companion.relationship}`);
            }
        });
        
        if (suggestions.length > 0) {
            context += suggestions.slice(0, 2).map(s => `• ${s}`).join('\n') + '\n';
            return context;
        }
        
        return null;
    }
    
    // Build goal-oriented choice context based on PC motivation
    private buildGoalOrientedChoiceContext(gameState: SaveData): string | null {
        const pc = gameState.party?.find(p => p.type === 'pc');
        if (!pc || !pc.motivation) return null;
        
        return `**Tạo lựa chọn hướng tới mục tiêu nhân vật:**\n• Ít nhất 1-2 lựa chọn phải liên quan đến việc thực hiện mục tiêu: "${pc.motivation}"\n• Tạo cơ hội tiến gần hơn đến mục tiêu hoặc giải quyết trở ngại cản trở mục tiêu\n`;
    }
    
    // NEW: Choice Diversity Engine - Add positive guidance for choice creation
    private buildChoiceDiversityContext(gameState: SaveData): string {
        const pc = gameState.party?.find(p => p.type === 'pc');
        const currentLocation = pc?.location;
        
        let context = "\n**HƯỚNG DẪN TẠO LỰA CHỌN ĐA DẠNG:**\n";
        
        // Suggest different action types
        const actionTypes = [
            "🗣️ GIAO TIẾP: Trò chuyện, hỏi thông tin, thuyết phục",
            "🏃 HÀNH ĐỘNG: Di chuyển, khám phá, tương tác vật thể", 
            "⚔️ CHIẾN THUẬT: Sử dụng kỹ năng, chiến đấu, phòng thủ",
            "🧠 CHIẾN LƯỢC: Quan sát, phân tích, lên kế hoạch",
            "💭 NỘI TÂM: Suy nghĩ sâu, hồi tưởng, quyết định quan trọng"
        ];
        
        context += "**Đảm bảo có ít nhất 2-3 loại hành động khác nhau:**\n";
        actionTypes.slice(0, 3).forEach(type => {
            context += `• ${type}\n`;
        });
        
        // Location-specific suggestions
        if (currentLocation) {
            context += `\n**Khai thác địa điểm "${currentLocation}":**\n`;
            context += `• Tạo lựa chọn phù hợp với đặc điểm và cơ hội của địa điểm này\n`;
        }
        
        // Skill utilization
        if (pc?.learnedSkills && pc.learnedSkills.length > 0) {
            context += `\n**Sử dụng kỹ năng có sẵn:**\n`;
            const skills = pc.learnedSkills.slice(0, 3);
            skills.forEach(skill => {
                context += `• Tạo cơ hội sử dụng "${skill}"\n`;
            });
        }
        
        // Companion interaction suggestions
        const companions = gameState.party?.filter(p => p.type === 'companion') || [];
        if (companions.length > 0) {
            context += `\n**Tương tác với đồng hành:**\n`;
            companions.slice(0, 2).forEach(companion => {
                context += `• Lựa chọn phối hợp hoặc giao tiếp với ${companion.name}\n`;
            });
        }
        
        // Time and duration variety
        context += `\n**Đa dạng thời gian thực hiện:**\n`;
        context += `• Tạo lựa chọn ngắn hạn (15-30 phút), trung hạn (1-2 giờ), và dài hạn (nửa ngày)\n`;
        context += `• Cân bằng giữa hành động nhanh và hoạt động suy tư\n`;
        
        context += `\n**LƯU Ý QUAN TRỌNG**: Mỗi lựa chọn phải:\n`;
        context += `• DẪN ĐẾN KẾT QUẢ KHÁC NHAU hoàn toàn\n`;
        context += `• Tạo ra các tình huống mới thú vị và không dự đoán trước\n`;
        context += `• Phản ánh tính cách và động cơ của nhân vật\n`;
        context += `• Có tính logic và hợp lý trong bối cảnh hiện tại\n`;
        
        return context;
    }
    
    // ADVANCED COT: Comprehensive Chain of Thought reasoning based on sillytarven framework
    private buildAdvancedCOTPrompt(action: string, gameState: SaveData): string {
        const pc = gameState.party?.find(p => p.type === 'pc');
        const companions = gameState.party?.filter(p => p.type === 'companion') || [];
        const recentHistory = gameState.gameHistory.slice(-4); // Last 2 turns (user+model pairs)
        
        console.log(`🧠 COT: Building advanced COT prompt for turn ${gameState.turnCount}:`, {
            pcName: pc?.name || 'Unknown',
            companionCount: companions.length,
            historyEntries: recentHistory.length,
            actionType: this.categorizeAction(action)
        });
        
        const cotPrompt = `
🧠 TRƯỚC KHI TẠO JSON RESPONSE - BẮT BUỘC PHẢI SUY NGHĨ:

🎯 **FORMAT BẮT BUỘC**: Bao gồm "cot_reasoning" field trong JSON với suy nghĩ chi tiết!

**BẮNG BUỘC**: Bạn phải bao gồm field "cot_reasoning" chứa:
**BƯỚC MỘT: PHÂN TÍCH TÌNH HUỐNG HIỆN TẠI**
Hãy viết ra suy nghĩ của bạn về tình huống hiện tại:

① **Sự kiện gần đây**: 
   ${this.extractRecentEvents(recentHistory)}

② **Thời gian & Địa điểm**:
   - Thời gian: ${this.formatGameTime(gameState.gameTime)}
   - Địa điểm: ${pc?.location || 'Không xác định'}

③ **Phân tích nhân vật sâu**:
   [NHÂN VẬT CHÍNH] ${pc?.name}:
   - Tính cách: ${pc?.personality || 'Chưa xác định'}
   - Mục tiêu: ${pc?.motivation || 'Chưa rõ'}
   - Trạng thái hiện tại: ${this.analyzeCharacterState(pc, gameState.statuses)}
   
   ${companions.length > 0 ? companions.map(comp => 
   `[ĐỒNG HÀNH] ${comp.name}:
   - Quan hệ với PC: ${comp.relationship || 'Bình thường'}
   - Tính cách: ${comp.personality || 'Chưa rõ'}
   - Trạng thái: ${this.analyzeCharacterState(comp, gameState.statuses)}`).join('\n   ') : '[Không có đồng hành]'}

④ **Trạng thái cơ thể và trang phục**:
   ${this.analyzePhysicalState(pc, gameState)}

**BƯỚC 2: CHỐNG ÁP BỨC**
Suy nghĩ về cân bằng quyền lực và tránh khuôn mẫu:
- Cân bằng quyền lực: ${this.analyzePowerBalance(gameState)}
- Tránh khuôn mẫu: ${this.getAntiStereotypeGuidance(gameState)}
- Đảm bảo agency: Mọi nhân vật phải có lựa chọn có ý nghĩa

**BƯỚC 3: ĐỀ CƯƠNG ĐÓNG VAI** 
Lên kế hoạch cụ thể cho phản ứng với hành động "${action}":
- **Phản ứng trực tiếp**: ${this.planDirectResponse(action, gameState)}
- **2-3 diễn biến mới**: ${this.planStoryProgression(gameState)}  
- **Kết nối với diễn biến trước**: ${this.planContinuity(recentHistory)}

**BƯỚC 3A: PHÂN TÍCH HÀNH ĐỘNG NGƯỜI CHƠI - BẮT BUỘC**
🎯 **ACTION COMPLETION ANALYSIS**:
① **Xác định loại hành động**: "${action}"
   - Loại: [Di chuyển/Tương tác/Chiến đấu/Đối thoại/Khám phá/Khác]
   - Độ phức tạp: [Đơn giản/Trung bình/Phức tạp]
② **KIỂM TRA HOÀN THÀNH TRONG LƯỢT NÀY**:
   - ✅ **BẮT BUỘC**: Hành động PHẢI được hoàn thành 100% trong story này
   - 🚫 **NGHIÊM CẤM**: Không để "đang di chuyển...", "sẽ tiếp tục...", "chưa đến nơi..."
   - 📍 **ĐẶC BIỆT VỚI DI CHUYỂN**: 
     * Nếu là di chuyển → PC PHẢI đến đích trong lượt này
     * Chỉ dừng lại nếu có sự kiện/gặp gỡ/trở ngại BẤT NGỜ xảy ra
     * Mô tả cả quá trình di chuyển + kết quả đến nơi
③ **KẾ HOẠCH HOÀN THÀNH**:
   - Điểm bắt đầu: [Mô tả tình huống khởi đầu]
   - Quá trình thực hiện: [Chi tiết diễn ra như thế nào]  
   - Kết quả cuối cùng: [Trạng thái sau khi hoàn thành]
   - Hậu quả/phản ứng: [NPC và môi trường phản ứng gì]

**BƯỚC 3B: KIỂM TRA NPC DECISIVENESS (BẮT BUỘC)**
⚡ **CRITICAL CHECK - NPC BEHAVIOR VALIDATION**:
① **Liệt kê TẤT CẢ NPCs sẽ xuất hiện**: Xác định mọi NPC có trong câu chuyện lượt này
② **Cho mỗi NPC - PLAN IMMEDIATE ACTION**: 
   - NPC sẽ làm GÌ ngay lượt này (cụ thể, rõ ràng)
   - NPC sẽ NÓI GÌ (nếu có đối thoại)
   - NPC sẽ PHẢN ỨNG thế nào với PC
③ **🚫 ĐẢM BẢO TUYỆT ĐỐI**: 
   - KHÔNG có NPC nào "suy nghĩ", "cân nhắc", "sẽ quyết định sau"
   - KHÔNG có NPC nào do dự hay trì hoãn hành động
   - MỌI NPC phải có hành động/phản ứng hoàn thành trong lượt này
④ **STORY LENGTH PLANNING - BẮT BUỘC**: 
   - **TARGET**: Câu chuyện PHẢI đạt 400-500 từ tiếng Việt
   - **CẤU TRÚC BẮT BUỘC**: 3-4 đoạn văn, mỗi đoạn 100-150 từ
   - **KẾ HOẠCH CHI TIẾT**: 
     * Đoạn 1: [Mô tả cảnh/tình huống + hành động NPC] ~120 từ
     * Đoạn 2: [Đối thoại + phản ứng cảm xúc] ~130 từ  
     * Đoạn 3: [Diễn biến chính + tương tác] ~120 từ
     * Đoạn 4: [Kết thúc scene + setup cho choices] ~100 từ
   - **CÔNG THỨC MỞ RỘNG**: Thêm chi tiết môi trường, cảm xúc nhân vật, miêu tả hành động cụ thể

**BƯỚC 4: CHỐNG LƯỜI VĂNG & KHUÔN SÁO**
Tự kiểm tra để tránh nội dung nhàm chán:
① **Tránh phản ứng template** - KHÔNG dùng cụm từ sáo mòn
② **Đảm bảo đối thoại tự nhiên** - Phù hợp bối cảnh và cảm xúc

**BƯỚC 4B: THIẾT KẾ LỰA CHỌN THEO YÊU CẦU**
Phân tích và tạo lựa chọn tuân thủ strict requirements:
① **Đa dạng thể loại (7-9 lựa chọn)**: hành động, xã hội, thăm dò, chiến đấu, tua nhanh thời gian, chuyển cảnh, nsfw(nếu enabled)
② **Tận dụng assets**: kiểm tra kỹ năng + vật phẩm của PC, tạo lựa chọn sử dụng chúng
③ **Thúc đẩy cốt truyện**: mỗi choice phải có potential thay đổi mối quan hệ/bối cảnh/thời gian
④ **Character consistency**: lựa chọn phù hợp tính cách PC (trừ lựa chọn chiến đấu)
⑤ **Information limitation**: chỉ dùng thông tin PC biết, tối đa 30 từ/choice
⑥ **Avoiding commands**: không dùng giọng điệu mệnh lệnh
⑦ **Category labeling**: hiển thị rõ thể loại [Hành Động], [Xã Hội], etc.

**BƯỚC 5: KIỂM TRA CUỐI**
Tự hỏi bản thân:
- Có kết nối tự nhiên với diễn biến trước không?
- Có tránh được lặp lại pattern cũ không?  
- Story có thúc đẩy phát triển nhân vật/mối quan hệ không?
- Choices có đủ đa dạng và thú vị không?
- **🎯 NPC FINAL VALIDATION**: Tất cả NPCs đã được plan hành động cụ thể chưa?
- **📏 WORD COUNT FINAL - NGHIÊM KHẮC**: 
  * Đếm từ cụ thể trong câu chuyện đã viết
  * NẾU DƯỚI 400 từ: PHẢI thêm chi tiết môi trường, cảm xúc, miêu tả hành động
  * NẾU TRÊN 500 từ: Rút gọn một chút nhưng giữ nội dung chính
  * KIỂM TRA LẠI: Đảm bảo 400-500 từ chính xác

**CUỐI CÙNG**: Tạo JSON response với tất cả suy nghĩ trên trong field "cot_reasoning":

{
  "cot_reasoning": "BƯỚC MỘT: [Tất cả phân tích tình huống]... BƯỚC HAI: [Cân bằng quyền lực]... BƯỚC BA: [Kế hoạch]... BƯỚC 3A: [PHÂN TÍCH HÀNH ĐỘNG - Loại: X, phải hoàn thành 100% trong lượt này, kế hoạch từ bắt đầu đến kết thúc]... BƯỚC 3B: [KIỂM TRA NPCs - liệt kê từng NPC và hành động cụ thể của họ]... BƯỚC BỐN: [Sáng tạo]... BƯỚC 4B: [Thiết kế lựa chọn theo yêu cầu]... BƯỚC NĂM: [Kiểm tra cuối + NPC validation + WORD COUNT VERIFICATION: Tôi đếm được X từ trong story, cần thêm/bớt Y từ để đạt 400-500 từ]",
  "story": "...",
  "choices": [...]
}

🚨 QUAN TRỌNG - ĐỌC KỸ TRƯỚC KHI TRẢ LỜI 🚨

**BẮT BUỘC TUÂN THỦ**: JSON response PHẢI có field "cot_reasoning" với suy nghĩ chi tiết!

**FORMAT CỤ THỂ - BẮT BUỘC THEO ĐÚNG**:

{
  "cot_reasoning": "BƯỚC MỘT: Tôi thấy tình huống hiện tại là... BƯỚC HAI: Về cân bằng quyền lực, tôi cần chú ý... BƯỚC BA: Kế hoạch của tôi là... BƯỚC 3A: Hành động '[action]' là loại [di chuyển/tương tác/khác], độ phức tạp [mức độ]. Tôi PHẢI hoàn thành 100% trong lượt này: bắt đầu từ [X], quá trình [Y], kết quả [Z]... BƯỚC 3B: NPCs trong câu chuyện - [Liệt kê từng NPC]: NPC1 sẽ làm [hành động cụ thể], NPC2 sẽ nói [lời cụ thể] và phản ứng [cách cụ thể]... BƯỚC BỐN: Để tránh nhàm chán, tôi sẽ... BƯỚC 4B: Cho lựa chọn, tôi cần 7-9 choices đa dạng thể loại... BƯỚC NĂM: Kiểm tra cuối - NPCs đã plan xong, WORD COUNT CHECK: Tôi dự tính story sẽ có khoảng X từ, cần thêm chi tiết [cụ thể gì] để đạt 400-500 từ...",
  "story": "...",
  "choices": [...]
}

❌ SAI: Không có field "cot_reasoning"
✅ ĐÚNG: Có field "cot_reasoning" với suy nghĩ đầy đủ

**LẦN NÀY PHẢI THEO FORMAT TRÊN - KHÔNG CÓ LỰA CHỌN KHÁC!**
`;
        
        console.log(`✅ COT: Advanced COT prompt completed`, {
            totalLength: cotPrompt.length,
            estimatedTokens: this.estimateTokens(cotPrompt),
            sections: ['Situation Analysis', 'Anti-Oppression', 'Role-Playing Outline', 'Anti-Cliché', 'Final Check'],
            ready: true
        });
        
        return cotPrompt;
    }
    
    // Helper methods for COT analysis
    private extractRecentEvents(history: GameHistoryEntry[]): string {
        if (history.length === 0) return "Chưa có sự kiện gần đây";
        
        const recentEvents = [];
        let processedEntries = 0;
        
        for (let i = history.length - 2; i < history.length; i++) {
            if (i >= 0 && history[i]) {
                const entry = history[i];
                if (entry.role === 'user') {
                    const action = entry.parts[0].text.replace('ACTION: ', '');
                    recentEvents.push(`Hành động: ${action}`);
                    processedEntries++;
                } else if (entry.role === 'model') {
                    try {
                        const parsed = JSON.parse(entry.parts[0].text);
                        if (parsed.story) {
                            const summary = this.extractStoryContinuity(parsed.story);
                            if (summary) {
                                recentEvents.push(`Kết quả: ${summary}`);
                                processedEntries++;
                            }
                        }
                    } catch (e) {
                        console.log(`🔍 COT: Could not parse model response for recent events extraction`);
                    }
                }
            }
        }
        
        const result = recentEvents.join(' → ') || "Bắt đầu phiêu lưu";
        console.log(`📋 COT: Extracted recent events from ${processedEntries} entries:`, result.substring(0, 100) + (result.length > 100 ? '...' : ''));
        return result;
    }
    
    private analyzeCharacterState(character: any, statuses: any[]): string {
        if (!character) return "Không xác định";
        
        const details = [];
        if (character.realm) details.push(`Cảnh giới: ${character.realm}`);
        
        const charStatuses = statuses.filter(s => s.owner === character.name);
        if (charStatuses.length > 0) {
            details.push(`Trạng thái: ${charStatuses.map(s => s.name).join(', ')}`);
        }
        
        return details.join(', ') || "Bình thường";
    }
    
    private analyzePhysicalState(pc: any, gameState: SaveData): string {
        if (!pc) return "Không xác định";
        
        const details = [];
        if (pc.appearance) details.push(`Ngoại hình: ${pc.appearance}`);
        
        // Analyze based on recent events for physical state
        const recentHistory = gameState.gameHistory.slice(-2);
        let physicalState = "Tỉnh táo, khỏe mạnh";
        
        for (const entry of recentHistory) {
            if (entry.role === 'model') {
                try {
                    const parsed = JSON.parse(entry.parts[0].text);
                    if (parsed.story && /mệt|thương|đau|kiệt sức/.test(parsed.story)) {
                        physicalState = "Có dấu hiệu mệt mỏi hoặc căng thẳng";
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        details.push(`Trạng thái: ${physicalState}`);
        return details.join(', ');
    }
    
    private analyzePowerBalance(gameState: SaveData): string {
        const pc = gameState.party?.find(p => p.type === 'pc');
        const companions = gameState.party?.filter(p => p.type === 'companion') || [];
        
        if (companions.length === 0) return "Không có vấn đề cân bằng quyền lực";
        
        // Analyze power dynamics
        const powerImbalances = [];
        companions.forEach(comp => {
            if (comp.realm === pc?.realm) {
                powerImbalances.push(`${comp.name} cùng cấp với PC - tạo sự cân bằng`);
            } else {
                powerImbalances.push(`${comp.name} - đảm bảo có tiếng nói riêng`);
            }
        });
        
        return powerImbalances.join(', ') || "Cần chú ý cân bằng";
    }
    
    private getAntiStereotypeGuidance(gameState: SaveData): string {
        return "Tránh nhân vật phẳng, mỗi NPC có động cơ và phản ứng riêng biệt";
    }
    
    private planDirectResponse(action: string, gameState: SaveData): string {
        const actionType = this.categorizeAction(action);
        return `Phản ứng ${actionType} phù hợp với tình huống và nhân vật`;
    }
    
    private planStoryProgression(gameState: SaveData): string {
        const suggestions = [
            "Giới thiệu yếu tố mới hoặc NPC",
            "Phát triển mối quan hệ hiện có",
            "Tạo cơ hội sử dụng kỹ năng",
            "Đặt ra thử thách nhỏ",
            "Tiết lộ thông tin thú vị"
        ];
        
        return suggestions.slice(0, 2).join(', ');
    }
    
    private planContinuity(recentHistory: GameHistoryEntry[]): string {
        if (recentHistory.length === 0) return "Bắt đầu mới";
        
        return "Nối tiếp tự nhiên từ diễn biến vừa rồi, không nhảy cóc";
    }
    
    private categorizeAction(action: string): string {
        const lower = action.toLowerCase();
        if (/nói|hỏi|trò chuyện/.test(lower)) return "giao tiếp";
        if (/tấn công|đánh|chiến đấu/.test(lower)) return "chiến đấu";
        if (/đi|di chuyển|tới/.test(lower)) return "di chuyển";
        if (/quan sát|nhìn|xem/.test(lower)) return "quan sát";
        return "hành động";
    }

    // ENHANCED: Special handling for party members with detailed context
    private formatEntityWithContext(
        entity: Entity,
        statuses: Status[],
        reasons: string[],
        maxTokens: number,
        gameState: SaveData
    ): string {
        let text = `• ${entity.name} (${entity.type})`;
        
        const details: string[] = [];
        
        // Enhanced party member context
        if (entity.type === 'companion') {
            text += ` [ĐỒNG HÀNH]`;
            
            // Core personality and motivation for companions
            if (entity.personality) details.push(`Tính cách: ${entity.personality}`);
            if (entity.personalityMbti && MBTI_PERSONALITIES[entity.personalityMbti]) {
                details.push(`MBTI: ${entity.personalityMbti} (${MBTI_PERSONALITIES[entity.personalityMbti].title})`);
            }
            if (entity.motivation) details.push(`Động cơ: ${entity.motivation}`);
            
            // Relationship with PC (critical for party dynamics)
            if (entity.relationship) {
                details.push(`Quan hệ với PC: ${entity.relationship}`);
            }
            
            // Skills and abilities (important for party coordination)
            if (entity.skills?.length) {
                const skillsArray = Array.isArray(entity.skills) ? entity.skills : entity.skills.split(',').map(s => s.trim());
                details.push(`Kỹ năng: ${skillsArray.slice(0, 4).join(', ')}`);
            }
            
            // Power level for tactical decisions
            if (entity.realm) details.push(`Cảnh giới: ${entity.realm}`);
            
        } else if (entity.type === 'pc') {
            // Player Character - EMPHASIZE MOTIVATION
            text += ` [NHÂN VẬT CHÍNH]`;
            if (entity.motivation) details.push(`**MỤC TIÊU QUAN TRỌNG**: ${entity.motivation}`);
            if (entity.learnedSkills && entity.learnedSkills.length > 0) {
                const skillsWithMastery = entity.learnedSkills.map(skillName => {
                    const skillEntity = Object.values(gameState.knownEntities).find((e: any) => e.name === skillName && e.type === 'skill');
                    if (skillEntity && skillEntity.mastery) {
                        return `${skillName} (${skillEntity.mastery})`;
                    }
                    return skillName;
                });
                details.push(`Kỹ năng: ${skillsWithMastery.join(', ')}`);
            }
            if (entity.personality) details.push(`Tính cách: ${entity.personality}`);
            if (entity.personalityMbti) details.push(`MBTI: ${entity.personalityMbti}`);
        } else if (entity.type === 'npc') {
            // Standard NPC context (reduced for non-party members)
            if (entity.personality) details.push(`Tính cách: ${entity.personality}`);
            if (entity.personalityMbti) details.push(`MBTI: ${entity.personalityMbti}`);
            if (entity.motivation) details.push(`Động cơ: ${entity.motivation}`);
            if (entity.skills?.length) {
                // Handle both string and array formats for skills
                const skillsArray = Array.isArray(entity.skills) ? entity.skills : entity.skills.split(',').map(s => s.trim());
                const skillsText = `Kỹ năng: ${skillsArray.slice(0, 3).join(', ')}`;
                details.push(skillsText);
                console.log(`🎯 Prompt Builder - NPC "${entity.name}" skills in prompt:`, skillsText);
            } else {
                console.log(`🎯 Prompt Builder - NPC "${entity.name}" has no skills (entity.skills:`, entity.skills, ')');
            }
        }
        
        if (entity.location) details.push(`Vị trí: ${entity.location}`);
        if (entity.realm && entity.type !== 'companion') details.push(`Cảnh giới: ${entity.realm}`);
        
        // Enhanced status effects for party members
        const entityStatuses = statuses.filter(s => s.owner === entity.name);
        if (entityStatuses.length > 0) {
            if (entity.type === 'companion') {
                // More detailed status for companions
                details.push(`Trạng thái: ${entityStatuses.map(s => `${s.name} (${s.type})`).slice(0, 3).join(', ')}`);
            } else {
                details.push(`Trạng thái: ${entityStatuses.map(s => s.name).slice(0, 2).join(', ')}`);
            }
        }
        
        // Description with priority for companions
        if (entity.description) {
            const remainingTokens = Math.max(0, maxTokens - this.estimateTokens(text + details.join('; ')));
            const threshold = entity.type === 'companion' ? 50 : 30; // Higher threshold for companions
            
            if (remainingTokens > threshold) {
                const truncatedDesc = this.aggressiveTruncation(entity.description, remainingTokens);
                details.push(`Mô tả: ${truncatedDesc}`);
            }
        }
        
        return text + "\n  " + details.join("\n  ");
    }

    private formatEntityBrief(entity: Entity, reasons: string[], maxTokens: number): string {
        const base = `• ${entity.name} (${entity.type})`;
        const reasonText = reasons.length > 0 ? ` [${reasons[0]}]` : '';
        const description = entity.description ? ` - ${entity.description}` : '';
        
        const fullText = base + reasonText + description;
        return this.aggressiveTruncation(fullText, maxTokens);
    }

    private buildQuestContext(quests: Quest[], maxTokens: number): string {
        if (quests.length === 0) return '';
        
        let context = "**Nhiệm vụ đang hoạt động:**\n";
        let usedTokens = this.estimateTokens(context);
        
        quests.forEach(quest => {
            const activeObjectives = quest.objectives.filter(o => !o.completed);
            const questText = `- ${quest.title}: ${activeObjectives.map(o => o.description).join(', ')}\n`;
            const questTokens = this.estimateTokens(questText);
            
            if (usedTokens + questTokens <= maxTokens) {
                context += questText;
                usedTokens += questTokens;
            }
        });
        
        return context + "\n";
    }

    // ENHANCED: Comprehensive history context for better story continuity with compressed data
    private buildSmartHistoryContext(history: GameHistoryEntry[], maxTokens: number): string {
        let context = "**DIỄN BIẾN VÀ QUYẾT ĐỊNH GẦN ĐÂY:**\n";
        let usedTokens = this.estimateTokens(context);
        
        const storyEvents: string[] = [];
        const userActions: string[] = [];
        
        // NEW: Include story flow from compressed history for continuity
        const gameState = this.currentGameState;
        if (gameState?.compressedHistory?.length > 0) {
            const recentCompressed = gameState.compressedHistory.slice(-1); // Most recent segment
            recentCompressed.forEach(segment => {
                if (segment.storyFlow && segment.storyFlow.length > 0) {
                    context += `**NGỮ CẢNH TỪ LỊCH SỬ NÉN (${segment.turnRange}):**\n`;
                    segment.storyFlow.forEach(flow => {
                        context += `• ${flow}\n`;
                        usedTokens += this.estimateTokens(flow) + 5;
                    });
                    context += "\n";
                }
            });
        }
        
        // IMPROVED: Include last 6 pairs (user + model) instead of 4
        const lookback = Math.min(6, Math.floor(history.length / 2));
        
        // Process both user actions AND AI responses for full context
        for (let i = history.length - lookback * 2; i < history.length; i++) {
            const entry = history[i];
            
            if (entry.role === 'user') {
                // Extract user action for context
                const actionText = entry.parts[0].text;
                if (actionText.startsWith('ACTION:')) {
                    const cleanAction = actionText.replace('ACTION: ', '').trim();
                    userActions.push(`[Hành động] ${cleanAction}`);
                }
            } else if (entry.role === 'model') {
                // Extract story continuity from AI response
                try {
                    const parsed = JSON.parse(entry.parts[0].text);
                    if (parsed.story) {
                        const storySegment = this.extractStoryContinuity(parsed.story);
                        if (storySegment) {
                            storyEvents.push(`[Kết quả] ${storySegment}`);
                        }
                    }
                    
                    // Extract important state changes
                    const stateChanges = this.extractStateChanges(parsed);
                    if (stateChanges) {
                        storyEvents.push(`[Thay đổi] ${stateChanges}`);
                    }
                } catch (e) {
                    // Skip malformed responses
                }
            }
        }
        
        // Build comprehensive context alternating actions and results
        const combined = [];
        for (let i = 0; i < Math.max(userActions.length, storyEvents.length); i++) {
            if (userActions[i]) combined.push(userActions[i]);
            if (storyEvents[i]) combined.push(storyEvents[i]);
        }
        
        // Add events with better token management
        combined.slice(-8).forEach(event => { // Last 8 events (4 pairs)
            const eventTokens = this.estimateTokens(event + '\n');
            if (usedTokens + eventTokens <= maxTokens) {
                context += event + '\n';
                usedTokens += eventTokens;
            }
        });
        
        context += "\n**TIẾP TỤC MẠCH TRUYỆN**: Đảm bảo câu chuyện chảy tự nhiên từ diễn biến trên!\n";
        return context;
    }

    private summarizeStory(story: string): string {
        // Extract key information from story
        // This is simplified - could use more sophisticated NLP
        const sentences = story.split(/[.!?]+/).filter(s => s.trim().length > 10);
        
        // Look for sentences with important keywords
        const importantKeywords = /chiến đấu|giết|chết|nhận được|mất|thành công|thất bại|phát hiện|gặp/;
        const importantSentences = sentences.filter(s => importantKeywords.test(s));
        
        if (importantSentences.length > 0) {
            return importantSentences[0].trim() + '.';
        }
        
        return sentences[0]?.trim() + '.' || '';
    }

    // NEW: Extract story continuity from AI responses (key events and context)
    private extractStoryContinuity(story: string): string | null {
        if (!story || story.length < 20) return null;
        
        // Tìm các câu có keyword quan trọng cho story continuity
        const sentences = story.split(/[.!?]+/).filter(s => s.trim().length > 15);
        const continuityKeywords = /đã|đang|sẽ|vừa|bắt đầu|kết thúc|phát hiện|gặp|nói|quyết định|cảm thấy|di chuyển|tới|về|rời/;
        
        // Lấy 1-2 câu quan trọng nhất
        const importantSentences = sentences
            .filter(s => continuityKeywords.test(s))
            .slice(0, 2)
            .map(s => s.trim());
        
        if (importantSentences.length === 0) {
            // Fallback: lấy câu đầu và cuối
            const firstSentence = sentences[0]?.trim();
            const lastSentence = sentences[sentences.length - 1]?.trim();
            
            if (firstSentence && firstSentence !== lastSentence) {
                return `${firstSentence}... ${lastSentence}.`;
            }
            return firstSentence ? `${firstSentence}.` : null;
        }
        
        return importantSentences.join('. ') + '.';
    }

    // NEW: Extract important game state changes from AI response
    private extractStateChanges(parsedResponse: any): string | null {
        const changes: string[] = [];
        
        try {
            // Location changes
            if (parsedResponse.location_update) {
                changes.push(`Vị trí → ${parsedResponse.location_update.new_location}`);
            }
            
            // Skill learning/updates
            if (parsedResponse.story?.includes('SKILL_LEARNED') || parsedResponse.story?.includes('SKILL_UPDATE')) {
                changes.push('Kỹ năng được cập nhật');
            }
            
            // Entity updates
            if (parsedResponse.entity_updates && parsedResponse.entity_updates.length > 0) {
                const entityCount = parsedResponse.entity_updates.length;
                changes.push(`${entityCount} thực thể cập nhật`);
            }
            
            // Quest updates
            if (parsedResponse.quest_updates && parsedResponse.quest_updates.length > 0) {
                changes.push('Nhiệm vụ tiến triển');
            }
            
            // Status effects
            if (parsedResponse.status_updates && parsedResponse.status_updates.length > 0) {
                changes.push('Trạng thái thay đổi');
            }
            
            // Memory creation
            if (parsedResponse.memory_update) {
                changes.push('Ký ức mới');
            }
            
            return changes.length > 0 ? changes.join(', ') : null;
            
        } catch (e) {
            return null;
        }
    }

    private buildContextualInfo(gameState: SaveData, maxTokens: number): string {
        let context = "\n=== BỐI CẢNH THẾ GIỚI ===\n";
        let usedTokens = this.estimateTokens(context);
        
        // World info - reference only
        if (gameState.worldData.worldName) {
            context += `Thế giới: ${gameState.worldData.worldName}\n\n`;
            usedTokens += this.estimateTokens(context);
        }
        
        // ANTI-DUPLICATION: List existing entity names to prevent AI from recreating them
        const entityNames = Object.keys(gameState.knownEntities);
        if (entityNames.length > 0) {
            const entityListText = `**⚠️ THỰC THỂ ĐÃ TỒN TẠI - KHÔNG TẠO LẠI:** ${entityNames.join(', ')}\n\n`;
            const entityListTokens = this.estimateTokens(entityListText);
            if (usedTokens + entityListTokens <= maxTokens * 0.1) { // Use max 10% of context budget
                context += entityListText;
                usedTokens += entityListTokens;
            }
        }
        
        // Chronicle (prioritized memories)
        const chronicleTokens = Math.floor((maxTokens - usedTokens) * 0.4);
        const chronicleContext = this.buildChronicleContext(gameState.chronicle, chronicleTokens);
        context += chronicleContext;
        usedTokens += this.estimateTokens(chronicleContext);
        
        // Pinned memories
        const memoryTokens = maxTokens - usedTokens;
        const pinnedMemories = gameState.memories?.filter(m => m.pinned) || [];
        
        if (pinnedMemories.length > 0 && memoryTokens > 100) {
            context += "**Ký ức quan trọng:**\n";
            pinnedMemories.slice(0, 1).forEach(mem => { // Reduced to 1 memory only
                const memText = `- ${mem.text}\n`;
                const memTokens = this.estimateTokens(memText);
                
                if (memTokens <= memoryTokens) {
                    context += memText;
                    memoryTokens - memTokens;
                }
            });
        }
        
        return context;
    }

    // UPDATED: Reduced chronicle entries
    private buildChronicleContext(chronicle: any, maxTokens: number): string {
        const memories: ScoredMemory[] = [];
        
        // Aggressive reduction for token savings
        chronicle.memoir.slice(-2).forEach((m: string) => memories.push({ memory: m, score: 100, type: 'memoir' })); // Reduced to 2
        chronicle.chapter.slice(-1).forEach((c: string) => memories.push({ memory: c, score: 70, type: 'chapter' })); // Reduced to 1
        // chronicle.turn removed completely to save tokens
        
        // Sort by score and build context
        memories.sort((a, b) => b.score - a.score);
        
        let context = "**Biên niên sử:**\n";
        let usedTokens = this.estimateTokens(context);
        
        memories.forEach(({ memory, type }) => {
            const prefix = type === 'memoir' ? '[Hồi ký] ' : type === 'chapter' ? '[Chương] ' : '[Lượt] ';
            const memText = `${prefix}${memory}\n`;
            const memTokens = this.estimateTokens(memText);
            
            if (usedTokens + memTokens <= maxTokens) {
                context += memText;
                usedTokens += memTokens;
            }
        });
        
        return context + "\n";
    }

    private buildSupplementalContext(
        gameState: SaveData,
        relevantEntities: EntityRelevance[],
        maxTokens: number,
        playerInput?: string,
        aiResponse?: string
    ): string {
        console.log(`🔧 Building supplemental context with ${gameState.customRules.length} total rules`);
        
        // Create activation context
        const activationContext: ActivationContext = {
            playerInput,
            aiResponse,
            gameHistory: gameState.gameHistory,
            entities: gameState.knownEntities,
            memories: gameState.memories,
            currentTurn: gameState.turnCount,
            scanDepth: 5, // Scan last 5 turns
            tokenBudget: maxTokens,
            caseSensitive: false,
            matchWholeWords: false
        };

        // Process rules through activation engine
        const activationResult = ruleActivationEngine.processRules(
            gameState.customRules,
            activationContext
        );

        // Format activated rules for prompt
        const formattedContext = ruleActivationEngine.formatForPrompt(activationResult);

        // Log activation statistics
        if (activationResult.activatedRules.length > 0) {
            console.log(`✅ Activated ${activationResult.activatedRules.length} rules using ${activationResult.totalTokens} tokens`);
            
            // Log which rules were activated and why
            activationResult.activatedRules.forEach(activated => {
                const rule = activated.rule;
                console.log(`  📋 "${rule.title || rule.id}": ${activated.activationReason} (Priority: ${rule.order || 0})`);
                if (activated.matchedKeywords.length > 0) {
                    console.log(`    🔍 Matched keywords: ${activated.matchedKeywords.join(', ')}`);
                }
            });
        }

        if (activationResult.budgetExceeded) {
            console.warn(`⚠️ Token budget exceeded, ${activationResult.skippedRules.length} rules skipped`);
        }

        return formattedContext;
    }
    
    /**
     * Build core game instructions that should always be included in AI prompts
     * These are the fundamental rules for choice generation and game mechanics
     */
    private buildCoreGameInstructions(): string {
        return `--- QUY TẮC TƯƠNG TÁC ---

**1. LỰA CHỌN HÀNH ĐỘNG:**
- Tạo 7-9 lựa chọn đa dạng: hành động, xã hội, thăm dó, chiến đấu, tua nhanh thời gian, chuyển cảnh, nsfw(nếu được bật)
- Tận dụng kỹ năng và vật phẩm của nhân vật
- Các lựa chọn cần có khả năng thúc đẩy mạnh mẽ cốt truyện hoặc mối quan hệ với người chơi khác, hoặc thay đổi bối cảnh, tua nhanh thời gian
- Các lựa chọn phải có khuynh hướng khác nhau
- Lựa chọn BẮT BUỘC PHẢI hiển thị thể loại, không được để tất cả các lựa chọn cùng một thể loại
- Lựa chọn Bắt Buộc phải phù hợp thiết lập nhân vật của người chơi trừ các lựa chọn "chiến đấu"
- Tránh các lựa chọn mang tính mệnh lệnh
- Lựa chọn không được chứa thông tin mà nhân vật người chơi không biết. Mỗi lựa chọn tối đa 30 chữ.

**🕒 BẮT BUỘC - HIỂN THỊ THỜI GIAN CHO MỖI LỰA CHỌN:**
- **MỌI lựa chọn hành động PHẢI bao gồm thời gian ước tính trong dấu ngoặc đơn**
- **Format bắt buộc:** "Mô tả hành động (X giờ)" hoặc "Mô tả hành động (X ngày)"
- **Ví dụ:**
  * "Khám phá khu rừng gần đây (2 giờ)"
  * "Đi đến thị trấn tiếp theo (1 ngày)"  
  * "Trò chuyện với thương gia (30 phút)"
  * "Luyện tập võ công (3 giờ)"
  * "Nghỉ ngơi và hồi phục (8 giờ)"
- **Thêm nhãn NSFW:** Nếu có lựa chọn 18+, thêm "(NSFW)" sau thời gian: "Qua đêm với X (8 giờ) (NSFW)"
- **Nguyên tắc thời gian:**
  * Trò chuyện/quan sát: 5-15 phút
  * Kiểm tra vật phẩm, kỹ năng: 5-10 phút
  * Hành động nhanh: 15-30 phút
  * Đi bộ: 30-60 phút
  * Dịch chuyển: 1-5 phút
  * Di chuyển ngắn: 1-2 giờ  
  * Hoạt động phức tạp: 2-4 giờ
  * Di chuyển xa: 4-8 giờ hoặc 1+ ngày
  * Nghỉ ngơi/ngủ: 6-8 giờ

**2. KẾT QUẢ HÀNH ĐỘNG:**
- Hành động thuộc loại "DI CHUYỂN" hoặc "TUA NHANH THỜI GIAN" BẮT BUỘC phải thay đổi vị trí hoặc thời gian. BẮT BUỘC hoàn thành trong một lượt.
- KHÔNG đảm bảo thành công
- Luôn luôn suy luận để quyết định kết quả
- Hậu quả logic dựa trên kỹ năng và hoàn cảnh, không nên bị động xoay quanh người chơi.

**3. CHIẾN ĐẤU:**
- Kẻ địch cũng có hành động và trạng thái
- Mô tả chi tiết và tạo tension

**4. THẾ GIỚI PHẢN ỨNG:**
- NPCs phản ứng với hành động của PC
- Môi trường thay đổi theo thời gian
- Sự kiện ngẫu nhiên và tình huống bất ngờ

--- ĐỊNH DẠNG VĂN BẢN ---

**1. LỜI KỂ:**
- 400-500 từ, chi tiết và sống động
- Sử dụng \`...\` cho suy nghĩ nội tâm
- \`**⭐...⭐**\` CHỈ cho thông báo hệ thống quan trọng (KHÔNG dùng cho tên skills, concepts, statuses, hay items)
- Format \`⭐...⭐\` (không bold) BẮT BUỘC cho nội dung Chronicle Turn
- Tôn trong tính cách các NPC, không phải luôn luôn xoay quanh, chiều lòng người chơi.
- Chủ động xây dựng các sự kiện đột phát giữa các lượt sau một thời gian nhất định(theo GameTime) như cướp bóc, ám sát, tỏ tình, cầu hôn....`;
    }


    private assembleFinalPrompt(
        action: string,
        sections: ContextSections,
        ruleChangeContext: string,
        nsfwContext: string,
        worldData: any,
        intelligentContext?: any,
        compactContext?: CompactRAGContext | null,
        gameState?: SaveData
    ): string {
        let prompt = "";
        
        // COT INSTRUCTIONS FIRST - ABSOLUTE PRIORITY
        prompt += `🚨🚨🚨 CRITICAL INSTRUCTION - READ FIRST 🚨🚨🚨

MANDATORY JSON RESPONSE FORMAT:
YOU MUST INCLUDE "cot_reasoning" FIELD WITH YOUR THINKING!

Example JSON:
{
  "cot_reasoning": "BƯỚC MỘT: Analyzing current situation... BƯỚC HAI: Considering power dynamics... BƯỚC BA: My strategy is... BƯỚC 4B: For choices, I need 7-9 diverse categories...",
  "story": "...",
  "choices": [...]
}

❌ WRONG: Missing cot_reasoning field
✅ CORRECT: Include cot_reasoning with detailed steps

MANDATORY! THE cot_reasoning FIELD IS REQUIRED!

========================================

`;
        
        // Rule changes (second priority)
        if (ruleChangeContext) {
            prompt += ruleChangeContext + "\n";
        }
        
        // Critical context
        prompt += sections.critical + "\n";
        
        // Phase 4: Intelligent Context (before important context)
        if (compactContext) {
            // Use compact reference-based context ONLY
            prompt += ReferenceBasedRAG.formatCompactContextForPrompt(compactContext) + "\n";
            console.log(`🔗 Using Reference-based RAG: ${compactContext.tokensSaved} tokens saved (${((compactContext.tokensSaved / compactContext.originalTokens) * 100).toFixed(1)}% reduction)`);
        } else if (intelligentContext && intelligentContext.relevantMemories.length > 0) {
            // Use traditional enhanced RAG context (fallback only)
            prompt += EnhancedRAG.formatContextForPrompt(intelligentContext) + "\n";
        }
        
        // Important context
        prompt += sections.important + "\n";
        
        // Contextual information
        prompt += sections.contextual + "\n";
        
        // Supplemental context
        if (sections.supplemental) {
            prompt += sections.supplemental + "\n";
        }
        
        // Player action with enhanced context and randomness to prevent duplicate responses
        const timestamp = Date.now();
        const randomSeed = Math.random().toString(36).substring(2, 8);
        
        if (gameState) {
            const actionAnalysis = this.analyzePlayerAction(action, gameState);
            
            prompt += `\n--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"${action}"\n`;
            prompt += `--- BỐI CẢNH HÀNH ĐỘNG ---\n`;
            prompt += `Lượt: ${gameState.turnCount || 0} | Thời gian: ${this.formatGameTime(gameState.gameTime)} | ID: ${randomSeed}\n`;
            prompt += `Phân tích: ${actionAnalysis.type} - ${actionAnalysis.description}\n`;
            prompt += `Độ phức tạp: ${actionAnalysis.complexity} | Thời gian dự kiến: ${actionAnalysis.expectedDuration}\n`;
            if (actionAnalysis.involvedEntities.length > 0) {
                prompt += `Đối tượng liên quan: ${actionAnalysis.involvedEntities.join(', ')}\n`;
            }
            prompt += `--- KẾT THÚC BỐI CẢNH ---\n`;
        } else {
            // Fallback when gameState is not available
            prompt += `\n--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"${action}"\n`;
            prompt += `--- BỐI CẢNH HÀNH ĐỘNG ---\n`;
            prompt += `ID: ${randomSeed} | Timestamp: ${new Date().toISOString()}\n`;
            prompt += `--- KẾT THÚC BỐI CẢNH ---\n`;
        }
        
        // Add smart choice generation context
        const choiceContext = this.buildSmartChoiceContext(sections, compactContext, intelligentContext);
        if (choiceContext) {
            prompt += `\n${choiceContext}`;
        }
        
        // Add advanced Chain of Thought reasoning - MANDATORY
        const cotReasoning = this.buildAdvancedCOTPrompt(action, gameState);
        if (cotReasoning) {
            console.log(`🧠 [Turn ${gameState?.turnCount || 0}] COT Prompt Built:`, {
                cotLength: cotReasoning.length,
                cotTokens: this.estimateTokens(cotReasoning),
                hasRecentEvents: cotReasoning.includes('Sự kiện gần đây'),
                hasCharacterAnalysis: cotReasoning.includes('NHÂN VẬT CHÍNH'),
                hasAntiOppression: cotReasoning.includes('CHỐNG ÁP BỨC'),
                action: action.substring(0, 50) + (action.length > 50 ? '...' : '')
            });
            // PRIORITY: Place COT at the very end for maximum visibility
            prompt += `\n\n` + "=".repeat(80) + `\n`;
            prompt += `🚨 QUAN TRỌNG: BẮT BUỘC PHẢI THỰC HIỆN COT REASONING TRƯỚC KHI TẠO JSON!\n`;
            prompt += "=".repeat(80) + `\n`;
            prompt += cotReasoning;
        }
        
        // NSFW context if applicable
        if (nsfwContext) {
            prompt += `\n${nsfwContext}`;
        } else if (worldData.allowNsfw) {
            prompt += `\nLƯU Ý: Chế độ NSFW đang BẬT.`;
        }
        
        prompt += `
=== YÊU CẦU XỬ LÝ ===
Tiếp tục câu chuyện dựa trên hành động và tri thức đã truy xuất.

=== QUY TẮC QUAN TRỌNG ===

**1. NGÔN NGỮ BẮT BUỘC - 100% TIẾNG VIỆT:**
• Tuyệt đối KHÔNG tiếng Anh (trừ tên riêng nước ngoài)
• Từ bắt buộc dịch: "friend"→"bạn", "enemy"→"kẻ thù", "ally"→"đồng minh", "lover"→"người yêu", "master"→"thầy", "rival"→"đối thủ"

**2. QUYỀN HẠN GM VÀ GIỚI HẠN:**
• CHỈ mô tả phản ứng NPC và môi trường
• NGHIÊM CẤM: đóng vai PC, mô tả/sửa đổi lời nói PC, quyết định thay PC

**3. NPC KHÔNG TOÀN TRI:**
NPC chỉ biết thông tin họ có thể biết, KHÔNG được truy cập bảng thông tin của PC/NPC khác.

✓ **VÍ DỤ ĐÚNG:**
PC có kỹ năng "Thiên Cơ Bất Truyền" nhưng chưa từng sử dụng trước mặt Sư phụ.
GM: Sư phụ nói: "Ta thấy ngươi tiến bộ nhanh, nhưng không rõ ngươi đã học được kỹ năng gì."

✗ **VÍ DỤ SAI:**
PC có kỹ năng "Thiên Cơ Bất Truyền" trong bảng kỹ năng.
GM: Sư phụ nói: "Ta biết ngươi đã học được Thiên Cơ Bất Truyền rồi."
[Sư phụ không thể biết kỹ năng chưa được PC tiết lộ]

**4. NGHIÊM CẤM ÂM MƯU HÓA PC:**
TUYỆT ĐỐI KHÔNG tự thêm động cơ/suy nghĩ/cảm xúc cho PC. CHỈ mô tả những gì NPC/môi trường quan sát được.

✗ **VÍ DỤ SAI:**
"Ngươi biết rõ kỹ năng đã tác động. Có vẻ cô gái này có ý chí mạnh mẽ hơn. **Điều này càng làm ngươi hứng thú hơn. Một thử thách đáng giá, đúng như ngươi mong đợi.**"
[GM KHÔNG THỂ biết PC cảm thấy "hứng thú" hay "mong đợi" - đây là suy nghĩ nội tâm của PC]

✓ **VÍ DỤ ĐÚNG:**
"Ngươi biết rõ kỹ năng đã tác động. Có vẻ cô gái này có ý chí mạnh mẽ hơn những người khác, nhưng không hoàn toàn miễn nhiễm."
[GM chỉ mô tả kết quả quan sát được, KHÔNG đoán cảm xúc PC]

🚨 **QUY TẮC VÀNG:** Nếu câu bắt đầu bằng "Ngươi cảm thấy/nghĩ/muốn/hứng thú..." → XÓA NGAY!

=== HƯỚNG DẪN KỸ THUẬT ===

**TAG KỸ NĂNG:**
• SKILL_UPDATE: Khi kỹ năng được THAY ĐỔI/NÂNG CẤP/GIẢI PHONG ẤN
  [SKILL_UPDATE: oldSkill="tên cũ" newSkill="tên mới" target="nhân vật" description="mô tả"]
• SKILL_LEARNED: Khi học kỹ năng HOÀN TOÀN MỚI (chưa từng có)
  [SKILL_LEARNED: name="tên kỹ năng" learner="nhân vật" description="mô tả"]
• KHÔNG BAO GIỜ tạo kỹ năng trùng lặp - luôn dùng SKILL_UPDATE để thay thế
• Ví dụ: "Thiên Hồ Huyễn Linh Bí Pháp (đang phong ấn)" → "Thiên Hồ Huyễn Linh Bí Pháp (Sơ Giải)" → dùng SKILL_UPDATE`;
        
        // Add COT instructions at the end of every prompt
        prompt += `

🚨 QUAN TRỌNG - BẮT BUỘC TUÂN THỦ 🚨

**BẮT BUỘC**: JSON response PHẢI có field "cot_reasoning"!

**FORMAT CỤ THỂ**:
{
  "cot_reasoning": "BƯỚC MỘT: Tôi thấy tình huống hiện tại là... BƯỚC HAI: Về cân bằng quyền lực, tôi cần chú ý... BƯỚC BA: Kế hoạch của tôi là... BƯỚC 3A: Hành động là [loại], tôi sẽ hoàn thành từ [điểm A] đến [điểm B] trong lượt này, không để dang dở... BƯỚC 3B: NPCs trong câu chuyện - [Liệt kê từng NPC]: NPC1 sẽ làm [hành động cụ thể], NPC2 sẽ nói [lời cụ thể] và phản ứng [cách cụ thể]... BƯỚC BỐN: Để tránh nhàm chán, tôi sẽ... BƯỚC 4B: Cho lựa chọn, tôi cần 7-9 choices đa dạng thể loại... BƯỚC NĂM: Kiểm tra cuối - NPCs đã plan xong, WORD COUNT VERIFICATION: Story hiện tại có X từ, cần [thêm/bớt] [chi tiết cụ thể] để đạt 400-500 từ...",
  "story": "...",
  "choices": [...]
}

❌ SAI: Thiếu field "cot_reasoning"
✅ ĐÚNG: Có field "cot_reasoning" với suy nghĩ đầy đủ

**TUÂN THỦ NGAY BÂY GIỜ - KHÔNG CÓ NGOẠI LỆ!**

🔥 **JSON PHẢI CÓ:** "cot_reasoning" field
🔥 **KHÔNG ĐƯỢC THIẾU:** "cot_reasoning" field"`;
        
        return prompt;
    }

    private truncateWithTokenLimit(text: string, maxTokens: number): string {
        const estimatedTokens = this.estimateTokens(text);
        
        if (estimatedTokens <= maxTokens) {
            return text;
        }
        
        // Calculate character limit based on token limit
        const charLimit = Math.floor(maxTokens / TOKEN_CONFIG.CHARS_PER_TOKEN);
        
        if (text.length <= charLimit) {
            return text;
        }
        
        // Smart truncation - try to break at sentence boundaries
        const truncated = text.substring(0, charLimit);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastComma = truncated.lastIndexOf(',');
        const lastSpace = truncated.lastIndexOf(' ');
        
        let breakPoint = Math.max(lastPeriod, lastComma, lastSpace);
        if (breakPoint < charLimit * 0.8) {
            breakPoint = charLimit;
        }
        
        return text.substring(0, breakPoint) + '...';
    }

    // ADDED: Emergency truncation method
    private emergencyTruncation(prompt: string): string {
        const totalTokens = this.estimateTokens(prompt);
        const hardLimit = 85000; // Emergency limit well under 100k
        
        if (totalTokens <= hardLimit) {
            return prompt;
        }
        
        console.warn(`🚨 EMERGENCY TRUNCATION: ${totalTokens} -> ${hardLimit}`);
        
        // Keep only critical sections
        const lines = prompt.split('\n');
        const criticalMarkers = ['=== TRI THỨC QUAN TRỌNG ===', '--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---'];
        
        let emergencyPrompt = '';
        let inCriticalSection = false;
        
        for (const line of lines) {
            if (criticalMarkers.some(marker => line.includes(marker))) {
                inCriticalSection = true;
            }
            
            if (inCriticalSection) {
                emergencyPrompt += line + '\n';
                
                if (this.estimateTokens(emergencyPrompt) > hardLimit) {
                    break;
                }
            }
        }
        
        return emergencyPrompt;
    }

    // UPDATED: Enhanced token limit enforcement with hard limit
    private enforceTokenLimit(prompt: string): string {
        const totalTokens = this.estimateTokens(prompt);
        const softLimit = TOKEN_CONFIG.MAX_TOKENS_PER_TURN - TOKEN_CONFIG.TOKEN_BUFFER;
        const hardLimit = 85000; // Well under 100k
        
        if (totalTokens <= softLimit) {
            console.log(`✅ Prompt tokens: ${totalTokens}/${softLimit} (Safe)`);
            return prompt;
        }
        
        if (totalTokens <= hardLimit) {
            console.warn(`⚠️ WARNING: Prompt near limit: ${totalTokens}/${hardLimit}`);
            return prompt;
        }
        
        // Emergency truncation with alert
        console.error(`🚨 CRITICAL: Prompt exceeds limit: ${totalTokens}/${hardLimit}. Emergency truncation applied!`);
        alert(`🚨 TOKEN LIMIT EXCEEDED!\nUsed: ${totalTokens}\nLimit: ${hardLimit}\nApplying emergency truncation.`);
        return this.emergencyTruncation(prompt);
    }

    private buildFallbackPrompt(action: string, gameState: SaveData): string {
        // Minimal prompt for error cases
        if (!gameState) {
            console.warn('🚨 buildFallbackPrompt: gameState is null/undefined');
            return `Hành động: ${action}\nTrạng thái: Lỗi hệ thống, không thể xử lý.`;
        }
        
        const pc = gameState.party?.find(p => p.type === 'pc');
        const pcName = pc?.name || 'Nhân vật chính';
        
        return `
=== THÔNG TIN CƠ BẢN ===
Nhân vật: ${pcName}
Vị trí: ${pc?.location || 'Không xác định'}
Lượt: ${gameState.turnCount}

--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---
"${action}"

=== YÊU CẦU XỬ LÝ ===
Tiếp tục câu chuyện dựa trên hành động và tri thức đã truy xuất.

=== QUY TẮC QUAN TRỌNG ===

**1. NGÔN NGỮ BẮT BUỘC - 100% TIẾNG VIỆT:**
• Tuyệt đối KHÔNG tiếng Anh (trừ tên riêng nước ngoài)
• Từ bắt buộc dịch: "friend"→"bạn", "enemy"→"kẻ thù", "ally"→"đồng minh", "lover"→"người yêu", "master"→"thầy", "rival"→"đối thủ"

**2. QUYỀN HẠN GM VÀ GIỚI HẠN:**
• CHỈ mô tả phản ứng NPC và môi trường
• NGHIÊM CẤM: đóng vai PC, mô tả/sửa đổi lời nói PC, quyết định thay PC

**3. NPC KHÔNG TOÀN TRI:**
NPC chỉ biết thông tin họ có thể biết, KHÔNG được truy cập bảng thông tin của PC/NPC khác.

✓ **VÍ DỤ ĐÚNG:**
PC có kỹ năng "Thiên Cơ Bất Truyền" nhưng chưa từng sử dụng trước mặt Sư phụ.
GM: Sư phụ nói: "Ta thấy ngươi tiến bộ nhanh, nhưng không rõ ngươi đã học được kỹ năng gì."

✗ **VÍ DỤ SAI:**
PC có kỹ năng "Thiên Cơ Bất Truyền" trong bảng kỹ năng.
GM: Sư phụ nói: "Ta biết ngươi đã học được Thiên Cơ Bất Truyền rồi."
[Sư phụ không thể biết kỹ năng chưa được PC tiết lộ]

**4. NGHIÊM CẤM ÂM MƯU HÓA PC:**
TUYỆT ĐỐI KHÔNG tự thêm động cơ/suy nghĩ/cảm xúc cho PC. CHỈ mô tả những gì NPC/môi trường quan sát được.

✗ **VÍ DỤ SAI:**
"Ngươi biết rõ kỹ năng đã tác động. Có vẻ cô gái này có ý chí mạnh mẽ hơn. **Điều này càng làm ngươi hứng thú hơn. Một thử thách đáng giá, đúng như ngươi mong đợi.**"
[GM KHÔNG THỂ biết PC cảm thấy "hứng thú" hay "mong đợi" - đây là suy nghĩ nội tâm của PC]

✓ **VÍ DỤ ĐÚNG:**
"Ngươi biết rõ kỹ năng đã tác động. Có vẻ cô gái này có ý chí mạnh mẽ hơn những người khác, nhưng không hoàn toàn miễn nhiễm."
[GM chỉ mô tả kết quả quan sát được, KHÔNG đoán cảm xúc PC]

🚨 **QUY TẮC VÀNG:** Nếu câu bắt đầu bằng "Ngươi cảm thấy/nghĩ/muốn/hứng thú..." → XÓA NGAY!

=== HƯỚNG DẪN KỸ THUẬT ===

**TAG KỸ NĂNG:**
• SKILL_UPDATE: Khi kỹ năng được THAY ĐỔI/NÂNG CẤP/GIẢI PHONG ẤN
  [SKILL_UPDATE: oldSkill="tên cũ" newSkill="tên mới" target="nhân vật" description="mô tả"]
• SKILL_LEARNED: Khi học kỹ năng HOÀN TOÀN MỚI (chưa từng có)
  [SKILL_LEARNED: name="tên kỹ năng" learner="nhân vật" description="mô tả"]
• KHÔNG BAO GIỜ tạo kỹ năng trùng lặp - luôn dùng SKILL_UPDATE để thay thế
• Ví dụ: "Thiên Hồ Huyễn Linh Bí Pháp (đang phong ấn)" → "Thiên Hồ Huyễn Linh Bí Pháp (Sơ Giải)" → dùng SKILL_UPDATE`;

    }

    // NEW: Helper methods for enhanced action context
    private analyzePlayerAction(action: string, gameState: SaveData) {
        const actionLower = action.toLowerCase();
        
        // Determine action type
        let type = 'khác';
        if (/nghỉ|ngồi|quan sát|xem|nhìn|thư giãn|tận hưởng/.test(actionLower)) {
            type = 'thư giãn/quan sát';
        } else if (/thử thách|yêu cầu|nhờ|đề nghị/.test(actionLower)) {
            type = 'tương tác/yêu cầu';
        } else if (/nói|hỏi|trò chuyện|tán gẫu/.test(actionLower)) {
            type = 'giao tiếp';
        } else if (/tấn công|chiến đấu|đánh/.test(actionLower)) {
            type = 'chiến đấu';
        } else if (/di chuyển|đi|chạy|bay/.test(actionLower)) {
            type = 'di chuyển';
        }

        // Extract time from action (if mentioned)
        let expectedDuration = 'Không xác định';
        const timeMatch = action.match(/\((\d+)\s*(phút|giờ|ngày)\)/);
        if (timeMatch) {
            expectedDuration = `${timeMatch[1]} ${timeMatch[2]}`;
        }

        // Determine complexity
        let complexity = 'Đơn giản';
        if (/thử thách|yêu cầu|nhờ/.test(actionLower)) {
            complexity = 'Trung bình';
        } else if (/chiến đấu|tấn công|kỹ năng/.test(actionLower)) {
            complexity = 'Phức tạp';
        }

        // Find involved entities
        const involvedEntities: string[] = [];
        const entities = gameState.knownEntities || {};
        
        // Check for NPC/companion names in action
        Object.keys(entities).forEach(entityName => {
            if (actionLower.includes(entityName.toLowerCase())) {
                involvedEntities.push(entityName);
            }
        });

        // Check for party members
        if (gameState.party) {
            gameState.party.forEach(member => {
                if (actionLower.includes(member.name.toLowerCase())) {
                    involvedEntities.push(member.name);
                }
            });
        }

        // Add common entities if mentioned
        if (/sakuya/i.test(action)) involvedEntities.push('Sakuya Izayoi');

        return {
            type,
            description: this.generateActionDescription(action, type),
            complexity,
            expectedDuration,
            involvedEntities: [...new Set(involvedEntities)] // Remove duplicates
        };
    }

    private generateActionDescription(action: string, type: string): string {
        const descriptions: { [key: string]: string } = {
            'thư giãn/quan sát': 'Hành động thư giãn, tập trung vào việc quan sát và tận hưởng',
            'tương tác/yêu cầu': 'Hành động tương tác chủ động, yêu cầu phản hồi từ người khác',
            'giao tiếp': 'Hành động giao tiếp xã hội, trao đổi thông tin',
            'chiến đấu': 'Hành động chiến đấu, có thể có nguy hiểm',
            'di chuyển': 'Hành động di chuyển từ nơi này sang nơi khác',
            'khác': 'Hành động đặc biệt hoặc không thuộc loại thông thường'
        };
        
        return descriptions[type] || 'Hành động cần được phân tích cụ thể';
    }

}

// Type definitions for the enhanced system
interface ActionIntent {
    type: 'movement' | 'combat' | 'social' | 'item_interaction' | 'skill_use' | 'exploration' | 'general';
    targets: string[];
    keywords: string[];
    isMovement: boolean;
    isCombat: boolean;
    isSocial: boolean;
    isItemUse: boolean;
    isSkillUse: boolean;
    isExploration: boolean;
}

interface TokenBudget {
    critical: number;
    important: number;
    contextual: number;
    supplemental: number;
}

interface ContextSections {
    critical: string;
    important: string;
    contextual: string;
    supplemental: string;
}

// Export singleton instance
export const enhancedRAG = new EnhancedRAGSystem();

// Backward compatibility wrapper
export const buildEnhancedRagPrompt = (
    action: string,
    gameState: SaveData,
    ruleChangeContext = '',
    playerNsfwRequest = ''
): string => {
    return enhancedRAG.buildEnhancedPrompt(
        action,
        gameState,
        ruleChangeContext,
        playerNsfwRequest
    );
};