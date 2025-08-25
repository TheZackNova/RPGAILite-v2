// Test script để kiểm tra token savings từ AI-response-only history optimization
import { enhancedRAG } from './components/promptBuilder';
import type { SaveData, GameHistoryEntry } from './components/types';

// Mock game state với history data thực tế
const mockGameState: SaveData = {
    worldData: {
        worldName: "Test World",
        genre: "fantasy",
        allowNsfw: false,
        worldDescription: "A fantasy world for testing",
        difficultyLevel: "normal",
        playerName: ""
    },
    knownEntities: {
        "Test NPC": {
            id: "npc1",
            name: "Test NPC",
            type: "npc",
            description: "A test character",
            location: "Test Location",
            personality: "Friendly and helpful",
            skills: ["Magic", "Combat"]
        }
    },
    statuses: [],
    quests: [],
    gameHistory: [] as GameHistoryEntry[], // Sẽ được điền sau
    memories: [],
    party: [{
        id: "pc1",
        name: "Hero",
        type: "pc",
        description: "The main character",
        location: "Test Location",
        motivation: "Save the world",
        realm: "Mortal",
        learnedSkills: ["Basic Combat"]
    }],
    customRules: [],
    regexRules: [],
    systemInstruction: "",
    turnCount: 10,
    totalTokens: 50000,
    gameTime: { year: 2024, month: 1, day: 1, hour: 12 },
    chronicle: {
        memoir: ["Started the adventure"],
        chapter: ["First chapter"],
        turn: ["First turn"]
    },
    compressedHistory: [],
    historyStats: { totalSegments: 0, totalTokensSaved: 0, averageCompressionRatio: 0 },
    cleanupStats: { totalCleaned: 0, lastCleanup: Date.now() },
    archivedMemories: [],
    memoryStats: { total: 0, pinned: 0, archived: 0, averageImportance: 0 },
    storyLog: [],
    choices: [],
    locationDiscoveryOrder: [],
    choiceHistory: []
};

// Tạo mock history với user prompts dài và AI responses
const createMockHistory = (entryCount: number): GameHistoryEntry[] => {
    const history: GameHistoryEntry[] = [];
    
    for (let i = 0; i < entryCount; i++) {
        // User entry (rất dài với full context)
        const userPrompt = `
=== TRI THỨC QUAN TRỌNG ===
Thời gian: Năm 2024 Tháng 1 Ngày ${i + 1}, 12 giờ 0 phút (Lượt ${i})

**TỔ ĐỘI PHIỀU LƯU:**
[Nhân vật chính] Hero - **MỤC TIÊU**: Save the world, Vị trí: Test Location, Thực lực: Mortal, Kỹ năng: Basic Combat

=== THÔNG TIN LIÊN QUAN ===
**Diễn biến gần đây:**
> Previous action context here...

=== BỐI CẢNH THẾ GIỚI ===
Thế giới: Test World

**Biên niên sử:**
[Hồi ký] Started the adventure
[Chương] First chapter

--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---
"Tôi muốn nói chuyện với Test NPC về nhiệm vụ của mình"

--- BỐI CẢNH HÀNH ĐỘNG ---
Lượt: ${i} | Thời gian: Năm 2024 Tháng 1 Ngày ${i + 1}, 12 giờ 0 phút | ID: test${i}
Phân tích: giao tiếp - Hành động giao tiếp xã hội, trao đổi thông tin
Độ phức tạp: Đơn giản | Thời gian dự kiến: Không xác định
Đối tượng liên quan: Test NPC

=== QUY TẮC QUAN TRỌNG ===
[... very long rules and instructions ...]
        `.trim();
        
        history.push({
            role: 'user',
            parts: [{ text: userPrompt }]
        });
        
        // AI response (ngắn hơn nhiều)
        const aiResponse = JSON.stringify({
            story: `Hero tiến đến gần Test NPC và bắt đầu cuộc trò chuyện. Test NPC nhìn lên và mỉm cười: "Chào mừng, anh hùng! Ta đã nghe về nhiệm vụ của ngươi. Có điều gì ta có thể giúp được không?"`,
            entity_updates: [{
                name: "Test NPC",
                changes: { relationship: "Friendly" }
            }],
            choices: [
                "Hỏi về nhiệm vụ cứu thế giới",
                "Yêu cầu lời khuyên về chiến đấu",
                "Tạm biệt và rời đi"
            ]
        });
        
        history.push({
            role: 'model',
            parts: [{ text: aiResponse }]
        });
    }
    
    return history;
};

// Test function
const testHistoryOptimization = () => {
    console.log('🧪 Testing AI-Response-Only History Optimization\n');
    
    // Tạo mock history với 5 turns (10 entries)
    const mockHistory = createMockHistory(5);
    mockGameState.gameHistory = mockHistory;
    
    console.log(`📊 Test Data:
- Total history entries: ${mockHistory.length}
- User entries: ${mockHistory.filter(e => e.role === 'user').length}  
- AI entries: ${mockHistory.filter(e => e.role === 'model').length}`);
    
    // Calculate token usage của full history
    const fullHistoryTokens = mockHistory.reduce((total, entry) => {
        return total + Math.ceil(entry.parts[0].text.length / 1.2); // chars per token estimate
    }, 0);
    
    console.log(`\n💾 Full History Token Usage: ${fullHistoryTokens} tokens`);
    
    // Test new optimized method
    console.log('\n🔧 Testing optimized buildSmartHistoryContext...');
    
    const maxTokensForHistory = 2000;
    
    // Gọi private method thông qua reflection (for testing)
    const ragInstance = (enhancedRAG as any);
    const optimizedContext = ragInstance.buildSmartHistoryContext(mockHistory, maxTokensForHistory);
    const optimizedTokens = Math.ceil(optimizedContext.length / 1.2);
    
    console.log(`\n📈 Results:
- Original full history: ${fullHistoryTokens} tokens
- Optimized context: ${optimizedTokens} tokens  
- Token savings: ${fullHistoryTokens - optimizedTokens} tokens
- Reduction: ${((fullHistoryTokens - optimizedTokens) / fullHistoryTokens * 100).toFixed(1)}%`);
    
    console.log(`\n📝 Optimized Context Preview:
${optimizedContext.substring(0, 500)}...`);
    
    // Test story continuity extraction
    console.log('\n🎭 Testing story continuity extraction...');
    const aiResponse = JSON.parse(mockHistory[1].parts[0].text); // First AI response
    const storyContinuity = ragInstance.extractStoryContinuity(aiResponse.story);
    console.log(`Story continuity extracted: "${storyContinuity}"`);
    
    // Test state changes extraction
    const stateChanges = ragInstance.extractStateChanges(aiResponse);
    console.log(`State changes extracted: "${stateChanges}"`);
    
    console.log('\n✅ History optimization test completed!');
};

// Chạy test
testHistoryOptimization();