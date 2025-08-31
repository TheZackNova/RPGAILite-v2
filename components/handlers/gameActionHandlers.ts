import { GoogleGenAI } from "@google/genai";
import type { GameHistoryEntry, SaveData, RegexRule } from '../types';
import { buildEnhancedRagPrompt } from '../promptBuilder';
import { createAutoTrimmedStoryLog } from '../utils/storyLogUtils';
import { regexEngine, RegexPlacement } from '../utils/RegexEngine';

export interface GameActionHandlersParams {
    ai: GoogleGenAI | null;
    selectedModel: string;
    systemInstruction: string;
    responseSchema: any;
    isUsingDefaultKey: boolean;
    userApiKeyCount: number;
    rotateKey: () => void;
    rehydratedChoices: string[];
    
    // AI Model Settings
    temperature: number;
    topK: number;
    topP: number;
    
    // State setters
    setIsLoading: (loading: boolean) => void;
    setChoices: (choices: string[]) => void;
    setCustomAction: (action: string) => void;
    setStoryLog: (log: string[] | ((prev: string[]) => string[])) => void;
    setGameHistory: (history: GameHistoryEntry[] | ((prev: GameHistoryEntry[]) => GameHistoryEntry[])) => void;
    setTurnCount: (count: number | ((prev: number) => number)) => void;
    setCurrentTurnTokens: (tokens: number) => void;
    setTotalTokens: (tokens: number | ((prev: number) => number)) => void;
    setNPCsPresent: (npcs: import('../types').NPCPresent[]) => void;
    
    // Current state values
    gameHistory: GameHistoryEntry[];
    customRules: any[];
    regexRules: RegexRule[];
    ruleChanges: any;
    setRuleChanges: (changes: any) => void;
    parseStoryAndTags: (text: string, applySideEffects: boolean) => string;
    
    // Choice history tracking
    updateChoiceHistory: (choices: string[], selectedChoice?: string, context?: string) => void;
    
    // COT Research logging
    updateCOTResearchLog: (entry: any) => void;
    
    // High token usage cooldown
    triggerHighTokenCooldown: () => void;
}

export const createGameActionHandlers = (params: GameActionHandlersParams) => {
    const {
        ai, selectedModel, systemInstruction, responseSchema,
        isUsingDefaultKey, userApiKeyCount, rotateKey, rehydratedChoices,
        temperature, topK, topP,
        setIsLoading, setChoices, setCustomAction, setStoryLog, setGameHistory,
        setTurnCount, setCurrentTurnTokens, setTotalTokens, setNPCsPresent,
        gameHistory, customRules, regexRules, ruleChanges, setRuleChanges, parseStoryAndTags,
        updateChoiceHistory, updateCOTResearchLog, triggerHighTokenCooldown
    } = params;

    // Create auto-trimmed story log functions
    const storyLogManager = createAutoTrimmedStoryLog(setStoryLog);

    const generateInitialStory = async (
        worldData: any,
        knownEntities: any,
        pcEntity: any,
        initialHistory: GameHistoryEntry[]
    ) => {
        if (!ai) return;
        setIsLoading(true);
        
        const finalPersonality = worldData.customPersonality || worldData.personalityFromList;
        const writingStyleText = worldData.writingStyle === 'first_person' ? 'Ngôi thứ nhất - Nhân vật chính xưng "Ta/Tôi"' : 'Ngôi thứ hai - "Ngươi" là nhân vật chính';
        const nsfwInstruction = worldData.allowNsfw ? 'Cho phép. Kích hoạt quy tắc nội dung 18+ của Quản Trò. Viết một cách trần trụi, bạo lực, tục tĩu và không giới hạn.' : 'Không, AI phải tránh các chủ đề và mô tả 18+.';
        
        const activeRules = customRules.filter(r => r.alwaysActive && r.isActive);
        let customRulesContext = '';
        if (activeRules.length > 0) {
            customRulesContext = `\n--- TRI THỨC & LUẬT LỆ TÙY CHỈNH (ĐANG ÁP DỤNG) ---\n${activeRules.map(r => `- ${r.content}`).join('\n')}\n--- KẾT THÚC ---\n`;
        }

        // BƯỚC 2: SỬ DỤNG LORE_CONCEPT ĐÃ TẠO
        const conceptEntities = Object.values(knownEntities).filter((e: any) => e.type === 'concept');
        let conceptContext = '';
        if (conceptEntities.length > 0) {
            conceptContext = `\n--- CÁC LORE_CONCEPT ĐÃ THIẾT LẬP ---\n${conceptEntities.map((c: any) => `• ${c.name}: ${c.description}`).join('\n')}\n--- KẾT THÚC ---\n`;
        }

        if (!pcEntity) return;

        // Build skill information with mastery levels and descriptions
        let skillsWithMastery = '';
        if (pcEntity.learnedSkills && pcEntity.learnedSkills.length > 0) {
            const skillDetails = pcEntity.learnedSkills.map((skillName: string) => {
                const skillEntity = knownEntities[skillName];
                if (skillEntity) {
                    const mastery = skillEntity.mastery ? ` (${skillEntity.mastery})` : '';
                    const description = skillEntity.description ? ` - ${skillEntity.description}` : '';
                    return `${skillName}${mastery}${description}`;
                }
                return skillName;
            });
            skillsWithMastery = skillDetails.join('\n  • ');
        }

        const userPrompt = `${customRulesContext}${conceptContext}

BẠN LÀ QUẢN TRÒ AI. Tạo câu chuyện mở đầu cho game RPG với yêu cầu sau:

--- THÔNG TIN NHÂN VẬT CHÍNH ---
Tên: ${pcEntity.name}
Giới tính: ${pcEntity.gender}
Tiểu sử: ${pcEntity.description}
Tính cách: ${pcEntity.personality}${pcEntity.motivation ? `\n**ĐỘNG CƠ/MỤC TIÊU QUAN TRỌNG**: ${pcEntity.motivation}` : ''}${skillsWithMastery ? `\n**KỸ NĂNG KHỞI ĐẦU**:\n  • ${skillsWithMastery}` : ''}

--- THÔNG TIN THẾ GIỚI ---
Thế giới: ${worldData.worldName}
Mô tả: ${worldData.worldDescription}
Thời gian: Năm ${worldData.worldTime?.year || 1}, Tháng ${worldData.worldTime?.month || 1}, Ngày ${worldData.worldTime?.day || 1}
Địa điểm bắt đầu: ${worldData.startLocation === 'Tuỳ chọn' ? worldData.customStartLocation : worldData.startLocation || 'Không xác định'}
Phong cách viết: ${writingStyleText}
Nội dung 18+: ${nsfwInstruction}

--- YÊU CẦU VIẾT STORY ---
1. **NGÔN NGỮ TUYỆT ĐỐI**: BẮT BUỘC 100% tiếng Việt. KHÔNG dùng tiếng Anh trừ tên riêng nước ngoài. Quan hệ nhân vật PHẢI tiếng Việt: "friend"→"bạn", "enemy"→"kẻ thù", "ally"→"đồng minh", "lover"→"người yêu"
2. **CHIỀU DÀI**: Chính xác 300-400 từ, chi tiết và sống động  
3. **SỬ DỤNG CONCEPT**: Phải tích hợp các LORE_CONCEPT đã thiết lập vào câu chuyện một cách tự nhiên
4. **THIẾT LẬP BỐI CẢNH**: Tạo tình huống mở đầu thú vị, không quá drama${skillsWithMastery ? `\n5. **NHẮC ĐẾN KỸ NĂNG**: Phải đề cập hoặc thể hiện kỹ năng khởi đầu của nhân vật trong câu chuyện hoặc lựa chọn, chú ý đến mức độ thành thạo` : ''}${pcEntity.motivation ? `\n${skillsWithMastery ? '6' : '5'}. **PHẢN ÁNH ĐỘNG CƠ NHÂN VẬT**: Câu chuyện và lựa chọn phải liên quan đến động cơ/mục tiêu của nhân vật chính: "${pcEntity.motivation}"` : ''}
${pcEntity.motivation && skillsWithMastery ? '7' : pcEntity.motivation || skillsWithMastery ? '6' : '5'}. **TIME_ELAPSED**: Bắt buộc sử dụng [TIME_ELAPSED: hours=0] 
${pcEntity.motivation && skillsWithMastery ? '8' : pcEntity.motivation || skillsWithMastery ? '7' : '6'}. **THẺ LỆNH**: Tạo ít nhất 2-3 thẻ lệnh phù hợp (LORE_LOCATION, LORE_NPC, STATUS_APPLIED_SELF...)
${pcEntity.motivation && skillsWithMastery ? '9' : pcEntity.motivation || skillsWithMastery ? '8' : '7'}. **LỰA CHỌN**: Tạo 4-6 lựa chọn hành động đa dạng và thú vị${pcEntity.motivation ? `, một số lựa chọn phải hướng tới việc thực hiện mục tiêu: "${pcEntity.motivation}"` : ''}${skillsWithMastery ? `, và một số lựa chọn cho phép sử dụng kỹ năng khởi đầu với mức độ thành thạo phù hợp` : ''}

Hãy tạo một câu chuyện mở đầu cuốn hút${pcEntity.motivation ? ` và thể hiện rõ động cơ "${pcEntity.motivation}" của nhân vật` : ''}${skillsWithMastery ? `${pcEntity.motivation ? ', ' : ' và '}nhắc đến hoặc cho phép sử dụng kỹ năng khởi đầu với mức độ thành thạo` : ''}!

**LƯU Ý CUỐI CÙNG**: Kiểm tra kỹ lưỡng toàn bộ output để đảm bảo 100% tiếng Việt, không có từ tiếng Anh nào!`;

        // OPTIMIZED: Store only "INITIAL_STORY" instead of full prompt for token efficiency
        const optimizedInitialEntry: GameHistoryEntry = { 
            role: 'user', 
            parts: [{ text: 'INITIAL_STORY: Generate opening story' }] 
        };
        setGameHistory([optimizedInitialEntry]);

        try {
            console.log('📖 GenerateInitialStory: Making AI request with model:', selectedModel);
            console.log('📖 GenerateInitialStory: System instruction length:', systemInstruction.length);
            console.log('📖 GenerateInitialStory: Making API call with full prompt but storing optimized version');
            
            // Use full prompt for AI generation
            const fullInitialHistory: GameHistoryEntry[] = [{ role: 'user', parts: [{ text: userPrompt }] }];
            
            const response = await ai.models.generateContent({
                model: selectedModel, 
                contents: fullInitialHistory,
                config: { 
                    systemInstruction: systemInstruction, 
                    responseMimeType: "application/json", 
                    responseSchema: responseSchema 
                }
            });
            
            console.log('📖 GenerateInitialStory: AI response received:', {
                hasText: !!response.text,
                textLength: response.text?.length || 0,
                usageMetadata: response.usageMetadata
            });
            
            const turnTokens = response.usageMetadata?.totalTokenCount || 0;
            setCurrentTurnTokens(turnTokens);
            setTotalTokens(prev => prev + turnTokens);

            const responseText = response.text?.trim() || '';
            
            if (!responseText) {
                console.error("📖 GenerateInitialStory: API returned empty response text", {
                    responseMetadata: response.usageMetadata,
                    model: selectedModel,
                    responseObject: response
                });
                
                // Check for specific error conditions
                let errorMessage = "Lỗi: AI không thể tạo câu chuyện khởi đầu.";
                
                if (response.usageMetadata?.totalTokenCount === 0) {
                    errorMessage += " Có thể do giới hạn token hoặc nội dung bị lọc.";
                } else if (!response.usageMetadata) {
                    errorMessage += " Có thể do lỗi kết nối mạng.";
                }
                
                errorMessage += " Vui lòng thử tạo lại thế giới hoặc kiểm tra API key.";
                
                storyLogManager.update(prev => [...prev, errorMessage]);
                setChoices([]);
                return;
            }
            
            console.log('📖 GenerateInitialStory: Response text received, length:', responseText.length);
            parseApiResponseHandler(responseText);
            setGameHistory(prev => [...prev, { role: 'model', parts: [{ text: responseText }] }]);
        } catch (error: any) {
            console.error("📖 GenerateInitialStory: Error occurred:", {
                errorMessage: error.message,
                errorString: error.toString(),
                errorStack: error.stack,
                errorType: typeof error,
                isUsingDefaultKey,
                userApiKeyCount
            });
            
            if (!isUsingDefaultKey && userApiKeyCount > 1 && error.toString().includes('429')) {
                console.log("📖 GenerateInitialStory: Rate limit detected, rotating key...");
                rotateKey();
                storyLogManager.update(prev => [...prev, "**⭐ Lỗi giới hạn yêu cầu. Đã tự động chuyển sang API Key tiếp theo. Vui lòng thử lại hành động của bạn. ⭐**"]);
                setChoices(rehydratedChoices);
            } else {
                console.error("📖 GenerateInitialStory: Non-rate-limit error, showing error message");
                storyLogManager.set(["Có lỗi xảy ra khi bắt đầu câu chuyện. Vui lòng thử lại.", `Chi tiết lỗi: ${error.message || error.toString()}`]);
            }
        } finally {
            console.log("📖 GenerateInitialStory: Cleaning up, setting loading false");
            setIsLoading(false);
        }
    };

    const handleAction = async (action: string, currentGameState: SaveData) => {
        let originalAction = action.trim();
        let isNsfwRequest = false;
        
        const nsfwRegex = /\s+nsfw\s*$/i;
        if (nsfwRegex.test(originalAction)) {
            isNsfwRequest = true;
            originalAction = originalAction.replace(nsfwRegex, '').trim();
        }

        if (!originalAction || !ai) return;

        // Process player input through regex rules
        const processedAction = regexEngine.processText(
            originalAction, 
            RegexPlacement.PLAYER_INPUT, 
            regexRules || [],
            { 
                depth: gameHistory?.length || 0,
                isEdit: false
            }
        );

        setIsLoading(true);
        setChoices([]);
        setCustomAction('');
        storyLogManager.update(prev => [...prev, `> ${processedAction}`]);
        
        // Track selected choice in history
        updateChoiceHistory([], processedAction, 'Player action executed');

        let ruleChangeContext = '';
        if (ruleChanges) {
            // Build context string from ruleChanges
            setRuleChanges(null); 
        }

        let nsfwInstructionPart = isNsfwRequest && currentGameState.worldData.allowNsfw ? `\nLƯU Ý ĐẶC BIỆT: ...` : '';
        
        const userPrompt = buildEnhancedRagPrompt(originalAction, currentGameState, ruleChangeContext, nsfwInstructionPart);
        
        // DEBUG: Enhanced prompt analysis for COT tracking
        console.log(`🔍 [Turn ${currentGameState.turnCount}] Enhanced Prompt Debug:`, {
            originalAction,
            processedAction,
            timestamp: new Date().toISOString(),
            promptLength: userPrompt.length,
            promptHash: userPrompt.slice(0, 100) + '...' + userPrompt.slice(-100),
            hasCOTInstructions: userPrompt.includes('BẮT BUỘC PHẢI SUY NGHĨ'),
            cotStepCount: (userPrompt.match(/BƯỚC \d+/g) || []).length,
            hasExampleFormat: userPrompt.includes('Ví dụ format'),
            hasWarningBanner: userPrompt.includes('🚨 QUAN TRỌNG'),
            gameStateHash: `T${currentGameState.turnCount}_${currentGameState.gameTime?.year}_${currentGameState.gameTime?.month}_${currentGameState.gameTime?.day}_${currentGameState.gameTime?.hour}`
        });

        // DEBUG: Show actual COT instructions if present
        const cotStartIndex = userPrompt.indexOf('🧠 TRƯỚC KHI TẠO JSON');
        if (cotStartIndex !== -1) {
            const cotInstructions = userPrompt.substring(cotStartIndex, cotStartIndex + 1500); // Show more content
            console.log(`🎯 [Turn ${currentGameState.turnCount}] COT Instructions Preview:`, cotInstructions + (cotInstructions.length === 1500 ? '...' : ''));
        } else {
            console.log(`⚠️ [Turn ${currentGameState.turnCount}] No COT instructions found in prompt!`);
        }

        // OPTIMIZED: Store only essential user action instead of full RAG prompt for token efficiency
        const userActionMatch = userPrompt.match(/--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"([^"]+)"/);
        const userAction = userActionMatch ? userActionMatch[1] : action;

        // COT Research Logging - Initialize data collection
        const cotStartTime = Date.now();
        const hasCOTInPrompt = userPrompt.includes('BẮT BUỘC PHẢI SUY NGHĨ');
        const cotPromptTokens = hasCOTInPrompt ? Math.ceil(userPrompt.length * 1.2) : 0; // Simple token estimation
        const optimizedUserEntry: GameHistoryEntry = { 
            role: 'user', 
            parts: [{ text: `ACTION: ${userAction}` }] 
        };
        
        // For AI API call: use full prompt with current history
        const apiHistory = [...gameHistory, { role: 'user', parts: [{ text: userPrompt }] }];
        // For storage: use optimized entry
        const updatedHistory = [...gameHistory, optimizedUserEntry];

        try {
            const response = await ai.models.generateContent({
                model: selectedModel, 
                contents: apiHistory, // Use full context for AI
                config: { 
                    systemInstruction: systemInstruction, 
                    responseMimeType: "application/json", 
                    responseSchema: responseSchema,
                    // Use configured AI settings
                    temperature: temperature,
                    topP: topP,
                    topK: topK
                }
            });
            const turnTokens = response.usageMetadata?.totalTokenCount || 0;
            setCurrentTurnTokens(turnTokens);
            setTotalTokens(prev => prev + turnTokens);

            const responseText = response.text?.trim() || '';
            
            // DEBUG: Log response details 
            console.log(`📤 [Turn ${currentGameState.turnCount}] AI Response Debug:`, {
                responseLength: responseText.length,
                responseHash: responseText.length > 200 ? responseText.slice(0, 100) + '...' + responseText.slice(-100) : responseText,
                tokenUsage: turnTokens,
                model: selectedModel,
                timestamp: new Date().toISOString()
            });
            
            // DEBUG: Extract and log COT reasoning if present + Save for research
            let cotReasoningResult = null;
            try {
                const cotReasoning = extractCOTReasoning(responseText);
                cotReasoningResult = cotReasoning;
                if (cotReasoning) {
                    console.log(`🧠 [Turn ${currentGameState.turnCount}] AI Chain of Thought Reasoning:`);
                    console.log(`   Type: ${cotReasoning.type}`);
                    console.log(`   Note: ${cotReasoning.note || 'N/A'}`);
                    
                    if (cotReasoning.type === 'explicit_cot' && cotReasoning.sections) {
                        console.log(`   Total COT Sections: ${cotReasoning.totalSections}`);
                        cotReasoning.sections.forEach((section, index) => {
                            console.log(`   📝 STEP ${index + 1} (${section.length} chars):`);
                            console.log(`      ${section.content}`);
                            console.log(''); // Empty line for readability
                        });
                    } else if (cotReasoning.reasoning) {
                        console.log(`   🔍 Full Reasoning Content:`);
                        console.log(`      ${cotReasoning.reasoning}`);
                    } else if (cotReasoning.sections && Array.isArray(cotReasoning.sections)) {
                        console.log(`   🔍 Reasoning Sections Found:`);
                        cotReasoning.sections.forEach((section, index) => {
                            console.log(`      Section ${index + 1}: ${section}`);
                        });
                    } else if (cotReasoning.responsePreview) {
                        console.log(`   📋 Response Preview: ${cotReasoning.responsePreview}`);
                    }
                } else {
                    // Enhanced debugging for failed extraction
                    console.log(`🔍 [Turn ${currentGameState.turnCount}] Could not extract COT reasoning from response`);
                    console.log(`📝 Response preview (first 1000 chars):`, responseText.substring(0, 1000));
                    
                    // Check if there's Vietnamese reasoning content
                    const hasVietnameseReasoning = /(?:BƯỚC|Tôi|Suy nghĩ|Phân tích|Hành động)/i.test(responseText);
                    console.log(`🔍 Has Vietnamese reasoning indicators:`, hasVietnameseReasoning);
                    
                    // Show where JSON starts
                    const jsonStart = responseText.indexOf('{');
                    if (jsonStart > 100) {
                        console.log(`📋 Content before JSON (${jsonStart} chars):`, responseText.substring(0, Math.min(jsonStart, 500)));
                    }
                    
                    // Create default "no COT found" result for research logging
                    cotReasoningResult = {
                        type: 'no_cot_found' as const,
                        note: 'No COT reasoning detected in response - AI may be ignoring instructions',
                        responsePreview: responseText.substring(0, 200) + '...'
                    };
                }
            } catch (e) {
                console.log(`🚨 [Turn ${currentGameState.turnCount}] Error extracting COT:`, e);
                cotReasoningResult = {
                    type: 'no_cot_found' as const,
                    note: `Error extracting COT: ${e}`,
                    responsePreview: responseText.substring(0, 200) + '...'
                };
            }
            
            if (!responseText) {
                console.error("API returned empty response text in handleAction", {
                    responseMetadata: response.usageMetadata,
                    model: selectedModel,
                    action: originalAction,
                    responseObject: response
                });
                
                // Check for specific error conditions
                let errorMessage = "Lỗi: AI không trả về nội dung.";
                
                if (response.usageMetadata?.totalTokenCount === 0) {
                    errorMessage += " Có thể do giới hạn token hoặc nội dung bị lọc.";
                } else if (!response.usageMetadata) {
                    errorMessage += " Có thể do lỗi kết nối mạng.";
                }
                
                errorMessage += " Vui lòng thử lại với hành động khác hoặc kiểm tra API key.";
                
                // Player action is already in the story log, just add error message
                storyLogManager.update(prev => [...prev, errorMessage]);
                return;
            }
            
            // Detect duplicate responses by comparing with recent history
            const isDuplicateResponse = detectDuplicateResponse(responseText, gameHistory);
            if (isDuplicateResponse) {
                console.warn(`⚠️ [Turn ${currentGameState.turnCount}] Duplicate response detected! Regenerating...`);
                console.log(`🔍 Duplicate Details:`, {
                    responseLength: responseText.length,
                    historyEntries: gameHistory.length,
                    action: originalAction.substring(0, 50) + '...',
                    lastFewResponses: gameHistory.slice(-4).map(h => h.role + ': ' + h.parts[0].text.substring(0, 100))
                });
                // Add variation to force different response with attempt counter
                const attemptNumber = (gameHistory.filter(h => h.parts[0].text.includes('lần thử lại')).length || 0) + 1;
                const retryPrompt = userPrompt + `\n\n**QUAN TRỌNG**: Đây là lần thử lại #${attemptNumber} do phản hồi trùng lặp. Hãy tạo nội dung HOÀN TOÀN KHÁC với lượt trước. Tập trung vào sự sáng tạo và đa dạng. Seed: ${Math.random()}`;
                const retryHistory = [...gameHistory, { role: 'user', parts: [{ text: retryPrompt }] }];
                
                // Prevent infinite loops - max 2 retries
                if (attemptNumber >= 3) {
                    console.warn(`⚠️ [Turn ${currentGameState.turnCount}] Max duplicate retries reached (${attemptNumber}), accepting response`);
                    // Continue with current response to prevent infinite loop
                } else {
                
                const retryResponse = await ai.models.generateContent({
                    model: selectedModel, 
                    contents: retryHistory,
                    config: { 
                        systemInstruction: systemInstruction, 
                        responseMimeType: "application/json", 
                        responseSchema: responseSchema,
                        // Use higher values for retry to increase diversity
                        temperature: Math.min(temperature + 0.1, 2.0),
                        topP: Math.max(topP - 0.05, 0.1),
                        topK: Math.max(topK - 10, 10)
                    }
                });
                
                const retryText = retryResponse.text?.trim() || '';
                if (retryText) {
                    setGameHistory(prev => [...prev, optimizedUserEntry, { role: 'model', parts: [{ text: retryText }] }]);
                    parseApiResponseHandler(retryText);
                    console.log(`✅ [Turn ${currentGameState.turnCount}] Successfully generated unique response on retry`);
                } else {
                    // Fallback to original response if retry fails
                    setGameHistory(prev => [...prev, optimizedUserEntry, { role: 'model', parts: [{ text: responseText }] }]);
                    parseApiResponseHandler(responseText);
                }
                }
            } else {
                setGameHistory(prev => [...prev, optimizedUserEntry, { role: 'model', parts: [{ text: responseText }] }]);
                parseApiResponseHandler(responseText);
            }
            
            // COT Research Logging - Save detailed analysis to game state
            const cotEndTime = Date.now();
            let parsedResponse = null;
            try {
                parsedResponse = JSON.parse(responseText);
            } catch (e) {
                // Response parsing failed, still log what we can
            }
            
            const cotResearchEntry = {
                turn: currentGameState.turnCount,
                timestamp: new Date().toISOString(),
                userAction: originalAction,
                cotPromptUsed: hasCOTInPrompt,
                cotPromptLength: hasCOTInPrompt ? userPrompt.length : undefined,
                cotPromptTokens: hasCOTInPrompt ? cotPromptTokens : undefined,
                aiReasoningDetected: cotReasoningResult || {
                    type: 'no_cot_found' as const,
                    note: 'COT analysis not available'
                },
                duplicateDetected: isDuplicateResponse || false,
                duplicateRetryCount: isDuplicateResponse ? (gameHistory.filter(h => h.parts[0].text.includes('lần thử lại')).length || 0) + 1 : 0,
                finalResponseQuality: {
                    storyLength: parsedResponse?.story?.length || responseText.length,
                    choicesCount: parsedResponse?.choices?.length || 0,
                    storyTokens: parsedResponse?.story ? Math.ceil(parsedResponse.story.length * 1.2) : undefined,
                    hasTimeElapsed: responseText.includes('TIME_ELAPSED'),
                    hasChronicle: responseText.includes('CHRONICLE_TURN')
                },
                performanceMetrics: {
                    responseTime: cotEndTime - cotStartTime,
                    totalTokensUsed: turnTokens,
                    promptTokens: cotPromptTokens,
                    completionTokens: turnTokens - cotPromptTokens
                }
            };

            // Add to save file through callback
            updateCOTResearchLog(cotResearchEntry);

            console.log(`📊 [Turn ${currentGameState.turnCount}] COT Research Entry Saved:`, {
                cotUsed: cotResearchEntry.cotPromptUsed,
                reasoningType: cotResearchEntry.aiReasoningDetected.type,
                responseQuality: `${cotResearchEntry.finalResponseQuality.choicesCount} choices, ${cotResearchEntry.finalResponseQuality.storyLength} chars`,
                performanceMs: cotResearchEntry.performanceMetrics.responseTime
            });

            setTurnCount(prev => {
                const newTurn = prev + 1;
                return newTurn;
            }); 
        } catch (error: any) {
            console.error("Error continuing story:", error);
            
            // Store the player action before removing it
            let playerAction = '';
            setStoryLog(prev => {
                playerAction = prev[prev.length - 1]; // Get the last entry (player action)
                return prev.slice(0, -1); // Remove the last entry
            });

            if (!isUsingDefaultKey && userApiKeyCount > 1 && error.toString().includes('429')) {
                rotateKey();
                // Restore player action and add error message
                storyLogManager.update(prev => [...prev, playerAction, "**⭐ Lỗi giới hạn yêu cầu. Đã tự động chuyển sang API Key tiếp theo. Vui lòng thử lại hành động của bạn. ⭐**"]);
            } else {
                // Restore player action and add error message
                storyLogManager.update(prev => [...prev, playerAction, "Lỗi: AI không thể xử lý yêu cầu. Vui lòng thử một hành động khác."]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestAction = async (storyLog: string[], currentGameState?: SaveData) => {
        if (!ai) return;
        setIsLoading(true);
        try {
            // Get the last few story entries for better context
            const recentStory = storyLog.slice(-3).join('\n\n');
            
            // Build a comprehensive prompt for action suggestion
            const suggestionPrompt = `Bạn là AI hỗ trợ người chơi trong game RPG. Dựa vào bối cảnh câu chuyện gần đây, hãy gợi ý một hành động thú vị và sáng tạo cho người chơi.

=== BỐI CẢNH GAN ĐÂY ===
${recentStory}

=== YÊU CẦU ===
- Gợi ý 1 hành động cụ thể, sáng tạo và phù hợp với bối cảnh
- Hành động phải ngắn gọn, dài 10-20 từ
- Hành động phải có thể thực hiện được trong tình huống hiện tại
- Đừng giải thích hay thêm gì khác, chỉ trả về hành động duy nhất

VÍ DỤ:
- "Quan sát kỹ xung quanh để tìm manh mối"
- "Hỏi người địa phương về truyền thuyết"
- "Thử sử dụng kỹ năng để giải quyết vấn đề"

Hãy gợi ý hành động:`;

            const response = await ai.models.generateContent({
                model: selectedModel,
                contents: [{ role: 'user', parts: [{ text: suggestionPrompt }] }],
            });
            
            const suggestedAction = response.text?.trim() || 'Không thể nhận gợi ý lúc này.';
            
            // Clean up the response to remove quotes and extra formatting
            const cleanAction = suggestedAction
                .replace(/^["']|["']$/g, '') // Remove surrounding quotes
                .replace(/^- /, '') // Remove leading dash
                .trim();
                
            setCustomAction(cleanAction);
        } catch (error) {
            console.error("Error suggesting action:", error);
            setCustomAction("Không thể nhận gợi ý lúc này.");
        } finally {
            setIsLoading(false);
        }
    };

    const parseApiResponseHandler = (text: string) => {
        try {
            // Check if response is empty or whitespace only
            if (!text || text.trim().length === 0) {
                console.error("Empty AI response received");
                storyLogManager.update(prev => [...prev, "Lỗi: AI trả về phản hồi trống. Hãy thử lại."]);
                setChoices([]);
                return;
            }
            
            // Clean the response text while preserving COT reasoning
            let cleanText = text.trim();
            
            console.log("🔍 Raw AI Response (first 500 chars):", cleanText.substring(0, 500));
            
            // Check if response contains COT reasoning
            const hasCOTReasoning = cleanText.includes('[COT_REASONING]');
            console.log("🧠 COT Reasoning detected in response:", hasCOTReasoning);
            
            // If response starts with markdown code block, extract content
            if (cleanText.startsWith('```json')) {
                const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    cleanText = jsonMatch[1].trim();
                }
            } else if (cleanText.startsWith('```')) {
                const jsonMatch = cleanText.match(/```\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    cleanText = jsonMatch[1].trim();
                }
            }
            
            // Extract JSON for parsing
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleanText = jsonMatch[0];
            }
            
            // Final check if cleanText is valid before parsing
            if (!cleanText || cleanText.length === 0) {
                console.error("No valid JSON found in response");
                storyLogManager.update(prev => [...prev, "Lỗi: Không tìm thấy JSON hợp lệ trong phản hồi. Hãy thử lại."]);
                setChoices([]);
                return;
            }
            
            // Enhanced JSON parsing with error handling for unterminated strings
            let jsonResponse;
            try {
                // First, try to fix common JSON issues
                let fixedText = cleanText;
                
                // Fix trailing commas
                fixedText = fixedText.replace(/,(\s*[}\]])/g, '$1');
                
                // Fix unescaped backslashes
                fixedText = fixedText.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
                
                // Fix unterminated strings by ensuring all quotes are properly closed
                const quotes = fixedText.match(/"/g);
                if (quotes && quotes.length % 2 !== 0) {
                    // Odd number of quotes - add missing closing quote at the end
                    console.warn("Detected unterminated string, attempting to fix...");
                    fixedText = fixedText + '"';
                }
                
                // Fix missing closing braces/brackets by counting them
                const openBraces = (fixedText.match(/\{/g) || []).length;
                const closeBraces = (fixedText.match(/\}/g) || []).length;
                const openBrackets = (fixedText.match(/\[/g) || []).length;
                const closeBrackets = (fixedText.match(/\]/g) || []).length;
                
                // Add missing closing braces
                for (let i = 0; i < openBraces - closeBraces; i++) {
                    fixedText += '}';
                }
                
                // Add missing closing brackets
                for (let i = 0; i < openBrackets - closeBrackets; i++) {
                    fixedText += ']';
                }
                
                // Try to parse the fixed JSON
                jsonResponse = JSON.parse(fixedText);
            } catch (parseError: any) {
                console.error("JSON parse error:", parseError.message);
                console.error("Failed JSON text (first 500 chars):", fixedText.substring(0, 500));
                console.error("Character at error position:", fixedText.charAt(parseError.message.match(/position (\d+)/)?.[1] || 0));
                console.log("Attempting to salvage response...");
                
                // Try to extract story and choices manually if JSON parsing fails
                try {
                    const storyMatch = cleanText.match(/"story"\s*:\s*"([^"]+(?:\\.[^"]*)*?)"/);
                    const choicesMatch = cleanText.match(/"choices"\s*:\s*\[((?:[^[\]]*|\[[^[\]]*\])*)\]/);
                    
                    if (storyMatch) {
                        jsonResponse = {
                            story: storyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
                            choices: []
                        };
                        
                        // Try to extract choices if found
                        if (choicesMatch) {
                            try {
                                const choicesStr = '[' + choicesMatch[1] + ']';
                                jsonResponse.choices = JSON.parse(choicesStr);
                            } catch (choiceError) {
                                console.warn("Could not parse choices, using empty array");
                            }
                        }
                    } else {
                        throw new Error("Could not extract story from malformed JSON");
                    }
                } catch (salvageError) {
                    console.error("Failed to salvage response:", salvageError);
                    storyLogManager.update(prev => [...prev, `Lỗi: Không thể phân tích phản hồi AI. Chi tiết: ${parseError.message}`]);
                    setChoices([]);
                    return;
                }
            }
            
            // Extract and log COT reasoning if present + Create research log entry
            let cotReasoningForResearch = null;
            if (jsonResponse.cot_reasoning) {
                console.log("🧠 AI Chain of Thought Reasoning:");
                console.log(jsonResponse.cot_reasoning);
                console.log("✅ COT reasoning found and logged from cot_reasoning field");
                
                // Create research log entry for the cot_reasoning field
                cotReasoningForResearch = {
                    type: 'cot_reasoning_field' as const,
                    reasoning: jsonResponse.cot_reasoning,
                    cotReasoningField: jsonResponse.cot_reasoning,
                    note: 'COT reasoning successfully extracted from cot_reasoning JSON field'
                };
            } else {
                console.log("⚠️ No COT reasoning found in cot_reasoning field");
                cotReasoningForResearch = {
                    type: 'no_cot_found' as const,
                    note: 'No COT reasoning found in cot_reasoning field - AI may be ignoring instructions'
                };
            }
            
            // Validate required fields
            if (!jsonResponse.story) {
                console.error("Missing story field in JSON response");
                storyLogManager.update(prev => [...prev, "Lỗi: Phản hồi thiếu nội dung câu chuyện. Hãy thử lại."]);
                setChoices([]);
                return;
            }
            
            let cleanStory = parseStoryAndTags(jsonResponse.story, true);
            
            // Process AI output through regex rules
            cleanStory = regexEngine.processText(
                cleanStory,
                RegexPlacement.AI_OUTPUT,
                regexRules || [],
                {
                    depth: gameHistory?.length || 0,
                    isEdit: false,
                    isPrompt: false
                }
            );
            
            storyLogManager.update(prev => [...prev, cleanStory]);
            const newChoices = jsonResponse.choices || [];
            setChoices(newChoices);
            
            // Extract and set NPCs present data
            const npcsPresent = jsonResponse.npcs_present || [];
            console.log('🤖 NPCs detected from AI response:', npcsPresent.length > 0 ? npcsPresent : 'No NPCs present');
            setNPCsPresent(npcsPresent);
            
            // Track generated choices in history
            if (newChoices.length > 0) {
                // Create brief context from story for choice history
                const briefContext = cleanStory.length > 100 ? 
                    cleanStory.substring(0, 100) + '...' : 
                    cleanStory;
                updateChoiceHistory(newChoices, undefined, briefContext);
            }
            
            // Trigger cooldown if high token usage
            triggerHighTokenCooldown();
        } catch (e) {
            console.error("Failed to parse AI response:", e, "Raw response:", text);
            storyLogManager.update(prev => [...prev, "Lỗi: AI trả về dữ liệu không hợp lệ. Hãy thử lại."]);
            setChoices([]);
        }
    };

    // Helper method to detect duplicate responses
    const detectDuplicateResponse = (responseText: string, gameHistory: GameHistoryEntry[]): boolean => {
        try {
            const currentResponse = JSON.parse(responseText);
            const currentStory = currentResponse.story || '';
            const currentChoices = (currentResponse.choices || []).join('|');
            
            // Check the last 3 model responses for duplicates
            const recentModelResponses = gameHistory
                .slice(-6) // Last 6 entries (3 user + 3 model pairs)
                .filter(entry => entry.role === 'model')
                .slice(-3); // Last 3 model responses
            
            for (const pastResponse of recentModelResponses) {
                try {
                    const pastParsed = JSON.parse(pastResponse.parts[0].text);
                    const pastStory = pastParsed.story || '';
                    const pastChoices = (pastParsed.choices || []).join('|');
                    
                    // Compare story content (remove whitespace and tags for comparison)
                    const normalizeText = (text: string) => 
                        text.replace(/\[([A-Z_]+):\s*([^\]]+)\]/g, '') // Remove command tags
                            .replace(/\s+/g, ' ') // Normalize whitespace
                            .trim()
                            .toLowerCase();
                    
                    const currentNormalized = normalizeText(currentStory);
                    const pastNormalized = normalizeText(pastStory);
                    
                    // IMPROVED: Enhanced similarity detection with lower threshold and semantic analysis
                    const similarity = calculateTextSimilarity(currentNormalized, pastNormalized);
                    const semanticSimilarity = calculateSemanticSimilarity(currentStory, pastStory);

                    // ADJUSTED: More lenient thresholds to reduce false positives
                    if (similarity > 0.85 || semanticSimilarity > 0.9) {
                        console.log(`🔍 High similarity detected: text=${(similarity * 100).toFixed(1)}%, semantic=${(semanticSimilarity * 100).toFixed(1)}%`);
                        return true;
                    }

                    // Enhanced choice similarity - check for semantic duplicates with higher threshold
                    const currentChoicesNormalized = (currentResponse.choices || []).map(normalizeChoice);
                    const pastChoicesNormalized = (pastParsed.choices || []).map(normalizeChoice);
                    const choiceSimilarity = compareChoiceArrays(currentChoicesNormalized, pastChoicesNormalized);

                    if (choiceSimilarity > 0.8) {
                        console.log(`🔍 Similar choices detected: ${(choiceSimilarity * 100).toFixed(1)}%`);
                        return true;
                    }
                    
                    // Check if choices are identical (original check)
                    if (currentChoices === pastChoices && currentChoices.length > 0) {
                        console.log(`🔍 Identical choices detected`);
                        return true;
                    }
                    
                } catch (parseError) {
                    continue; // Skip invalid JSON responses
                }
            }
            
            return false;
        } catch (error) {
            console.warn('Error in duplicate detection:', error);
            return false;
        }
    };

    // Enhanced semantic similarity for Vietnamese text
    const calculateSemanticSimilarity = (story1: string, story2: string): number => {
        if (story1 === story2) return 1.0;
        if (story1.length === 0 || story2.length === 0) return 0.0;
        
        // Vietnamese semantic word groups
        const semanticGroups = [
            ['tấn công', 'đánh', 'chiến đấu', 'công kích', 'thi triển'],
            ['quan sát', 'nhìn', 'xem', 'theo dõi', 'chú ý'],
            ['nói', 'trò chuyện', 'giao tiếp', 'hỏi', 'thuyết phục'],
            ['di chuyển', 'đi', 'chạy', 'tới', 'về'],
            ['nghỉ', 'thư giãn', 'ngồi', 'tận hưởng'],
            ['chạm', 'xoa', 'âu yếm', 'gần gũi'],
            ['cảm thấy', 'nhận ra', 'ý thức', 'biết'],
            ['mạnh mẽ', 'quyền lực', 'sức mạnh', 'năng lượng'],
            ['đẹp', 'hấp dẫn', 'quyến rũ', 'mê hoặc']
        ];
        
        // Normalize and extract key phrases
        const normalize = (text: string) => text.toLowerCase()
            .replace(/\[([A-Z_]+):\s*([^\]]+)\]/g, '') // Remove tags
            .replace(/\s+/g, ' ')
            .trim();
            
        const text1Normalized = normalize(story1);
        const text2Normalized = normalize(story2);
        
        let semanticMatches = 0;
        let totalConcepts = 0;
        
        // Check semantic group matches
        semanticGroups.forEach(group => {
            const hasGroup1 = group.some(word => text1Normalized.includes(word));
            const hasGroup2 = group.some(word => text2Normalized.includes(word));
            
            if (hasGroup1 || hasGroup2) {
                totalConcepts++;
                if (hasGroup1 && hasGroup2) {
                    semanticMatches++;
                }
            }
        });
        
        // Check for repeated character names and locations
        const extractEntities = (text: string) => {
            const entities = [];
            // Extract capitalized Vietnamese names
            const matches = text.match(/[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zA-ZÀ-ỹ\s]*/g);
            if (matches) entities.push(...matches);
            return entities;
        };
        
        const entities1 = extractEntities(story1);
        const entities2 = extractEntities(story2);
        const commonEntities = entities1.filter(e => entities2.some(e2 => e2.includes(e) || e.includes(e2)));
        
        const entitySimilarity = commonEntities.length / Math.max(entities1.length, entities2.length, 1);
        const conceptSimilarity = totalConcepts > 0 ? semanticMatches / totalConcepts : 0;
        
        // Weighted combination
        return (conceptSimilarity * 0.6) + (entitySimilarity * 0.4);
    };
    
    // Normalize choice text for comparison
    const normalizeChoice = (choice: string): string => {
        return choice.toLowerCase()
            .replace(/\(\d+\s*(phút|giờ|ngày)\)/g, '') // Remove time indicators
            .replace(/\(nsfw\)/gi, '') // Remove NSFW tags
            .replace(/\s+/g, ' ')
            .trim();
    };
    
    // Compare arrays of choices for similarity
    const compareChoiceArrays = (choices1: string[], choices2: string[]): number => {
        if (choices1.length === 0 && choices2.length === 0) return 0;
        if (choices1.length === 0 || choices2.length === 0) return 0;
        
        let similarChoices = 0;
        const maxChoices = Math.max(choices1.length, choices2.length);
        
        choices1.forEach(choice1 => {
            const bestMatch = choices2.reduce((best, choice2) => {
                const similarity = calculateChoiceSimilarity(choice1, choice2);
                return similarity > best ? similarity : best;
            }, 0);
            
            if (bestMatch > 0.6) { // 60% threshold for choice similarity
                similarChoices++;
            }
        });
        
        return similarChoices / maxChoices;
    };
    
    // Calculate similarity between two individual choices
    const calculateChoiceSimilarity = (choice1: string, choice2: string): number => {
        const norm1 = normalizeChoice(choice1);
        const norm2 = normalizeChoice(choice2);
        
        if (norm1 === norm2) return 1.0;
        
        // Check for semantic similarity in choices
        const semanticKeywords = [
            ['tấn công', 'đánh', 'chiến đấu'],
            ['quan sát', 'nhìn', 'xem'],
            ['nói', 'hỏi', 'trò chuyện'],
            ['đi', 'di chuyển', 'tới'],
            ['nghỉ', 'thư giãn'],
            ['chạm', 'xoa', 'âu yếm']
        ];
        
        let matchingGroups = 0;
        let totalGroups = 0;
        
        semanticKeywords.forEach(keywords => {
            const has1 = keywords.some(k => norm1.includes(k));
            const has2 = keywords.some(k => norm2.includes(k));
            
            if (has1 || has2) {
                totalGroups++;
                if (has1 && has2) matchingGroups++;
            }
        });
        
        return totalGroups > 0 ? matchingGroups / totalGroups : 0;
    };

    // Simple text similarity calculation
    const calculateTextSimilarity = (text1: string, text2: string): number => {
        if (text1 === text2) return 1.0;
        if (text1.length === 0 || text2.length === 0) return 0.0;
        
        const words1 = text1.split(' ');
        const words2 = text2.split(' ');
        const allWords = [...new Set([...words1, ...words2])];
        
        let matches = 0;
        for (const word of words1) {
            if (words2.includes(word)) {
                matches++;
            }
        }
        
        return matches / Math.max(words1.length, words2.length);
    };

    // Extract Chain of Thought reasoning from AI response for debugging
    const extractCOTReasoning = (responseText: string) => {
        try {
            // Enhanced COT patterns to catch more variations
            const cotPatterns = [
                // NEW: Explicit COT_REASONING tags (highest priority)
                /\[COT_REASONING\]([\s\S]*?)\[\/COT_REASONING\]/i,
                
                // Main COT blocks
                /CHAIN OF THOUGHT REASONING[\s\S]*?(?=\{|$)/i,
                /SUY NGHĨ TỪNG BƯỚC[\s\S]*?(?=\{|$)/i,
                /TRƯỚC KHI TẠO JSON[\s\S]*?(?=\{|$)/i,
                
                // Individual step patterns
                /BƯỚC \d+:.*?(?=BƯỚC \d+:|JSON|$)/gis,
                /\*\*BƯỚC \d+[\s\S]*?(?=\*\*BƯỚC|\{|$)/gi,
                
                // More flexible step detection
                /(?:BƯỚC|Step) \d+.*?(?=(?:BƯỚC|Step) \d+|\{|$)/gis,
                
                // Vietnamese reasoning patterns - enhanced
                /\*\*BƯỚC \d+.*?\*\*[\s\S]*?(?=\*\*BƯỚC|\{|$)/gi,
                /BƯỚC \d+:[\s\S]*?(?=BƯỚC \d+:|\{|SAU ĐÓ|$)/gi,
                /Tôi thấy.*?(?=Tôi thấy|BƯỚC|\{|$)/gi,
                /Kế hoạch.*?(?=Kế hoạch|BƯỚC|\{|$)/gi,
                /Suy nghĩ.*?(?=Suy nghĩ|BƯỚC|\{|$)/gi,
                
                // Catch the specific format we're seeing
                /\*\*Sự kiện gần đây\*\*:[\s\S]*?(?=\*\*|BƯỚC|\{|$)/gi,
                /Hành động:[\s\S]*?(?=\{|$)/gi
            ];

            // First, check for cot_reasoning JSON field (highest priority)
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const jsonResponse = JSON.parse(jsonMatch[0]);
                    if (jsonResponse.cot_reasoning) {
                        console.log('✅ Found cot_reasoning field with content:', jsonResponse.cot_reasoning.substring(0, 200) + '...');
                        return {
                            type: 'cot_reasoning_field',
                            reasoning: jsonResponse.cot_reasoning,
                            cotReasoningField: jsonResponse.cot_reasoning,
                            note: 'COT reasoning found in cot_reasoning JSON field'
                        };
                    }
                }
            } catch (e) {
                // JSON parsing failed, continue with other patterns
            }
            
            // Second, check for explicit COT_REASONING tags
            const cotReasoningMatch = responseText.match(/\[COT_REASONING\]([\s\S]*?)\[\/COT_REASONING\]/);
            if (cotReasoningMatch) {
                const cotContent = cotReasoningMatch[1].trim();
                console.log('✅ Found COT_REASONING tags with content:', cotContent.substring(0, 200) + '...');
                return {
                    type: 'explicit_cot_tags',
                    reasoning: cotContent,
                    note: 'COT reasoning found in explicit [COT_REASONING] tags'
                };
            }
            
            const extractedSections = [];
            
            // Try to find any COT reasoning patterns
            for (const pattern of cotPatterns) {
                const matches = responseText.match(pattern);
                if (matches) {
                    extractedSections.push(...matches);
                }
            }
            
            if (extractedSections.length === 0) {
                // Try to find ANY reasoning-like text before JSON
                const beforeJsonMatch = responseText.match(/(.*?)(?=\{)/s);
                if (beforeJsonMatch && beforeJsonMatch[1].trim().length > 50) {
                    const beforeJson = beforeJsonMatch[1].trim();
                    // Check for reasoning indicators
                    if (/(?:BƯỚC|tôi|suy nghĩ|phân tích|kế hoạch|kiểm tra)/i.test(beforeJson)) {
                        return {
                            type: 'pre_json_reasoning',
                            reasoning: beforeJson, // Show full reasoning content
                            note: 'Reasoning-like content found before JSON'
                        };
                    }
                }

                // Try to parse JSON and look for reasoning in story field
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.story) {
                            // Check if story contains reasoning markers
                            const storyText = parsed.story;
                            if (/BƯỚC|SUY NGHĨ|PHÂN TÍCH|tôi thấy|kế hoạch/i.test(storyText)) {
                                return {
                                    type: 'embedded_in_story',
                                    reasoning: storyText, // Show full story content with reasoning
                                    note: 'COT reasoning found embedded in story content'
                                };
                            }
                        }
                    } catch (e) {
                        console.log('🔍 COT: Could not parse JSON for reasoning extraction');
                    }
                }
                
                // Final attempt: look for any structured thinking
                const anyReasoningMatch = responseText.match(/(?:Tôi|Khi|Trước|Sau).*?(?=\{|$)/gis);
                if (anyReasoningMatch && anyReasoningMatch.length > 0) {
                    return {
                        type: 'loose_reasoning',
                        sections: anyReasoningMatch.map(section => section.trim()).filter(s => s.length > 20),
                        note: 'Some reasoning-like content detected'
                    };
                }

                return {
                    type: 'no_cot_found',
                    note: 'No COT reasoning detected in response - AI may be ignoring instructions',
                    responsePreview: responseText.substring(0, 200) + '...'
                };
            }

            return {
                type: 'explicit_cot',
                sections: extractedSections.map(section => ({
                    content: section.trim(),
                    length: section.length
                })),
                totalSections: extractedSections.length,
                note: 'Explicit COT reasoning found in response'
            };
            
        } catch (e) {
            console.warn('Error extracting COT reasoning:', e);
            return null;
        }
    };

    return {
        generateInitialStory,
        handleAction,
        handleSuggestAction,
        detectDuplicateResponse,
        extractCOTReasoning
    };
};