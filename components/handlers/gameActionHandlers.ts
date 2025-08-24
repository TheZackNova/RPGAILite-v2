import { GoogleGenAI } from "@google/genai";
import type { GameHistoryEntry, SaveData, RegexRule } from '../types';
import { buildEnhancedRagPrompt } from '../promptBuilder';
import { EntityExportManager } from '../utils/EntityExportManager';
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
    
    // State setters
    setIsLoading: (loading: boolean) => void;
    setChoices: (choices: string[]) => void;
    setCustomAction: (action: string) => void;
    setStoryLog: (log: string[] | ((prev: string[]) => string[])) => void;
    setGameHistory: (history: GameHistoryEntry[] | ((prev: GameHistoryEntry[]) => GameHistoryEntry[])) => void;
    setTurnCount: (count: number | ((prev: number) => number)) => void;
    setCurrentTurnTokens: (tokens: number) => void;
    setTotalTokens: (tokens: number | ((prev: number) => number)) => void;
    
    // Current state values
    gameHistory: GameHistoryEntry[];
    customRules: any[];
    regexRules: RegexRule[];
    ruleChanges: any;
    setRuleChanges: (changes: any) => void;
    parseStoryAndTags: (text: string, applySideEffects: boolean) => string;
    
    // Choice history tracking
    updateChoiceHistory: (choices: string[], selectedChoice?: string, context?: string) => void;
    
    // High token usage cooldown
    triggerHighTokenCooldown: () => void;
}

export const createGameActionHandlers = (params: GameActionHandlersParams) => {
    const {
        ai, selectedModel, systemInstruction, responseSchema,
        isUsingDefaultKey, userApiKeyCount, rotateKey, rehydratedChoices,
        setIsLoading, setChoices, setCustomAction, setStoryLog, setGameHistory,
        setTurnCount, setCurrentTurnTokens, setTotalTokens,
        gameHistory, customRules, regexRules, ruleChanges, setRuleChanges, parseStoryAndTags,
        updateChoiceHistory, triggerHighTokenCooldown
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
        
        const activeRules = customRules.filter(r => r.alwaysActive);
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

        const finalHistory: GameHistoryEntry[] = [{ role: 'user', parts: [{ text: userPrompt }] }];
        setGameHistory(finalHistory);

        try {
            console.log('📖 GenerateInitialStory: Making AI request with model:', selectedModel);
            console.log('📖 GenerateInitialStory: System instruction length:', systemInstruction.length);
            console.log('📖 GenerateInitialStory: Initial history:', finalHistory);
            
            const response = await ai.models.generateContent({
                model: selectedModel, 
                contents: finalHistory,
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
        
        // DEBUG: Log prompt details to track duplicate responses
        console.log(`🔍 [Turn ${currentGameState.turnCount}] Action Handler Debug:`, {
            originalAction,
            processedAction,
            timestamp: new Date().toISOString(),
            promptLength: userPrompt.length,
            promptHash: userPrompt.slice(0, 100) + '...' + userPrompt.slice(-100),
            gameStateHash: `T${currentGameState.turnCount}_${currentGameState.gameTime?.year}_${currentGameState.gameTime?.month}_${currentGameState.gameTime?.day}_${currentGameState.gameTime?.hour}`
        });

        const newUserEntry: GameHistoryEntry = { role: 'user', parts: [{ text: userPrompt }] };
        const updatedHistory = [...gameHistory, newUserEntry];

        try {
            const response = await ai.models.generateContent({
                model: selectedModel, 
                contents: updatedHistory,
                config: { 
                    systemInstruction: systemInstruction, 
                    responseMimeType: "application/json", 
                    responseSchema: responseSchema,
                    // Add randomness to prevent duplicate responses
                    temperature: 0.9, // Higher temperature for more variability
                    topP: 0.95,
                    topK: 40
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
                // Add variation to force different response
                const retryPrompt = userPrompt + `\n\n**QUAN TRỌNG**: Đây là lần thử lại do phản hồi trùng lặp. Hãy tạo nội dung HOÀN TOÀN KHÁC với lượt trước. Seed: ${Math.random()}`;
                const retryHistory = [...gameHistory, { role: 'user', parts: [{ text: retryPrompt }] }];
                
                const retryResponse = await ai.models.generateContent({
                    model: selectedModel, 
                    contents: retryHistory,
                    config: { 
                        systemInstruction: systemInstruction, 
                        responseMimeType: "application/json", 
                        responseSchema: responseSchema,
                        temperature: 1.0, // Even higher temperature for retry
                        topP: 0.9,
                        topK: 30
                    }
                });
                
                const retryText = retryResponse.text?.trim() || '';
                if (retryText) {
                    setGameHistory(prev => [...prev, newUserEntry, { role: 'model', parts: [{ text: retryText }] }]);
                    parseApiResponseHandler(retryText);
                    console.log(`✅ [Turn ${currentGameState.turnCount}] Successfully generated unique response on retry`);
                } else {
                    // Fallback to original response if retry fails
                    setGameHistory(prev => [...prev, newUserEntry, { role: 'model', parts: [{ text: responseText }] }]);
                    parseApiResponseHandler(responseText);
                }
            } else {
                setGameHistory(prev => [...prev, newUserEntry, { role: 'model', parts: [{ text: responseText }] }]);
                parseApiResponseHandler(responseText);
            }
            
            setTurnCount(prev => {
                const newTurn = prev + 1;
                
                // 🔄 Auto-export entities every few turns (with unique ID to prevent duplicates)
                const exportId = `export_${newTurn}_${Date.now()}_${Math.random().toString(36)}`;
                
                setTimeout(async () => {
                    try {
                        if (EntityExportManager.shouldExport(newTurn, exportId)) {
                            const exportSuccess = await EntityExportManager.exportEntities(currentGameState, exportId);
                        }
                    } catch (error) {
                        console.error(`🚨 [Turn ${newTurn}] Entity export error (ID: ${exportId}):`, error);
                    }
                }, 1000); // Delay to ensure state is updated
                
                
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
            
            // Clean the response text to remove any non-JSON content
            let cleanText = text.trim();
            
            // If response starts with markdown code block, extract JSON
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
            
            // Try to find JSON object if response has extra text
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
                
                // Fix unterminated strings by ensuring all quotes are properly closed
                const quotes = fixedText.match(/"/g);
                if (quotes && quotes.length % 2 !== 0) {
                    // Odd number of quotes - add missing closing quote at the end
                    console.warn("Detected unterminated string, attempting to fix...");
                    fixedText = fixedText + '"';
                }
                
                // Try to parse the fixed JSON
                jsonResponse = JSON.parse(fixedText);
            } catch (parseError: any) {
                console.error("JSON parse error:", parseError.message);
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
                    
                    // Check if stories are very similar (90% similarity)
                    const similarity = calculateTextSimilarity(currentNormalized, pastNormalized);
                    if (similarity > 0.9) {
                        console.log(`🔍 High similarity detected: ${(similarity * 100).toFixed(1)}%`);
                        return true;
                    }
                    
                    // Check if choices are identical
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

    return {
        generateInitialStory,
        handleAction,
        handleSuggestAction,
        detectDuplicateResponse
    };
};