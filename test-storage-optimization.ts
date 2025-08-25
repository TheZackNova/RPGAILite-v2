// Test script to verify storage-level history optimization
import type { GameHistoryEntry } from './components/types';

// Simulate the optimization logic from gameActionHandlers.ts
const optimizeUserEntry = (fullUserPrompt: string, userAction: string): GameHistoryEntry => {
    const userActionMatch = fullUserPrompt.match(/--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"([^"]+)"/);
    const extractedAction = userActionMatch ? userActionMatch[1] : userAction;
    
    return { 
        role: 'user', 
        parts: [{ text: `ACTION: ${extractedAction}` }] 
    };
};

// Test the optimization
const testStorageOptimization = () => {
    console.log('🧪 Testing Storage-Level History Optimization\n');
    
    // Mock a typical full user prompt from the save file
    const fullUserPrompt = `
=== TRI THỨC QUAN TRỌNG ===
Thời gian: Năm 2014 Tháng 4 Ngày 6, 8 giờ 0 phút (Lượt 1)

**TỔ ĐỘI PHIỀU LƯU:**
[Nhân vật chính] Kaji  Akuma - **MỤC TIÊU**: Vui vẻ tùy ý trải qua 3 năm học, Thực lực: Người thường, Kỹ năng: Thiên Dục Thần Thể (Viên Mãn), Mị Lực Siêu Phàm (Viên Mãn), Siêu Cấp May Mắn (Viên Mãn), Dị Năng: Khống Chế Hạt Cơ Bản (Viên Mãn)

--- REFERENCE SYSTEM ---
Entities are referenced by ID (e.g., REF_NP_CHA_12345678). Use these IDs when referencing entities.
For detailed entity information, use the reference ID to look up full details.

=== THÔNG TIN LIÊN QUAN ===
**Diễn biến gần đây:**
Ánh sáng dịu nhẹ của buổi sáng sớm tháng Tư xuyên qua khung cửa sổ, chiếu rọi lên những hàng ghế trống và những gương mặt xa lạ đang ngồi rải rác. "Mị Lực Siêu Phàm" (Viên Mãn) của ngươi đang phát huy tác dụng mạnh mẽ, như một luồng điện nhẹ nhàng lan tỏa trong không khí, khiến không gian dường như ấm áp và sinh động hơn.

=== BỐI CẢNH THẾ GIỚI ===
**Biên niên sử:**

=== LUẬT LỆ TÙY CHỈNH ĐƯỢC KÍCH HOẠT ===

[格式] (Độ ưu tiên: 999)
Format Explanation

Final Output Sequence:
1.The AI's complete output for every turn must strictly follow this sequence of major blocks and tags:
2.The <content>...</content> block
3.The <NPC_action>...</NPC_action> block
4.The <calendar>...</calendar> block

[... thousands more characters of rules and context ...]

--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---
"Bắt chuyện với một bạn học nữ đang nhìn ngươi với ánh mắt ngưỡng mộ (20 phút) (NSFW)"
--- BỐI CẢNH HÀNH ĐỘNG ---
Lượt: 1 | Thời gian: Năm 2014 Tháng 4 Ngày 6, 8 giờ 0 phút | ID: abc123
Phân tích: giao tiếp - Hành động giao tiếp xã hội, trao đổi thông tin
Độ phức tạp: Trung bình | Thời gian dự kiến: 20 phút
--- KẾT THÚC BỐI CẢNH ---

[... more context and rules ...]
`.trim();

    const userAction = "Bắt chuyện với một bạn học nữ đang nhìn ngươi với ánh mắt ngưỡng mộ (20 phút) (NSFW)";
    
    console.log(`📊 Original Data:
- Full prompt length: ${fullUserPrompt.length} characters
- Estimated tokens: ${Math.ceil(fullUserPrompt.length / 1.2)} tokens`);
    
    // Test optimization
    const optimizedEntry = optimizeUserEntry(fullUserPrompt, userAction);
    const optimizedText = optimizedEntry.parts[0].text;
    
    console.log(`\n📈 Optimization Results:
- Original: ${fullUserPrompt.length} characters (${Math.ceil(fullUserPrompt.length / 1.2)} tokens)
- Optimized: ${optimizedText.length} characters (${Math.ceil(optimizedText.length / 1.2)} tokens)
- Token savings: ${Math.ceil(fullUserPrompt.length / 1.2) - Math.ceil(optimizedText.length / 1.2)} tokens
- Reduction: ${(((fullUserPrompt.length - optimizedText.length) / fullUserPrompt.length) * 100).toFixed(1)}%`);
    
    console.log(`\n📝 Optimized Entry:
"${optimizedText}"`);
    
    // Test with AI response
    const mockAiResponse = JSON.stringify({
        story: "Kaji Akuma tiến đến gần Satou Maya, cô gái đang nhìn mình với ánh mắt ngưỡng mộ. \"Chào Maya-san, mình là Kaji. Có thể ngồi cùng bàn được không?\" Maya đỏ mặt và gật đầu, cảm thấy tim đập nhanh khi anh ngồi xuống bên cạnh.",
        entity_updates: [
            { name: "Satou Maya", changes: { relationship: "Acquaintance", affection: 15 } }
        ],
        choices: [
            "Tiếp tục trò chuyện về sở thích cá nhân",
            "Hỏi về các môn học và kế hoạch tương lai",
            "Chấm dứt cuộc trò chuyện một cách lịch sự"
        ]
    });
    
    console.log(`\n🤖 AI Response Storage:
- AI response length: ${mockAiResponse.length} characters
- AI response tokens: ${Math.ceil(mockAiResponse.length / 1.2)} tokens`);
    
    // Calculate total savings for a typical conversation
    const conversationTurns = 10;
    const totalOriginalTokens = conversationTurns * Math.ceil(fullUserPrompt.length / 1.2);
    const totalOptimizedTokens = conversationTurns * (Math.ceil(optimizedText.length / 1.2) + Math.ceil(mockAiResponse.length / 1.2));
    
    console.log(`\n💡 Projected Savings for ${conversationTurns} turns:
- Original total: ${totalOriginalTokens.toLocaleString()} tokens
- Optimized total: ${totalOptimizedTokens.toLocaleString()} tokens  
- Total savings: ${(totalOriginalTokens - totalOptimizedTokens).toLocaleString()} tokens
- Overall reduction: ${(((totalOriginalTokens - totalOptimizedTokens) / totalOriginalTokens) * 100).toFixed(1)}%`);
    
    console.log('\n✅ Storage optimization test completed!');
    console.log('\n🎯 Key Benefits:');
    console.log('• GameHistory storage is dramatically reduced');
    console.log('• Save files become much smaller and faster to load');  
    console.log('• AI still receives full context for quality responses');
    console.log('• Story continuity preserved through AI-response-only history context');
};

// Run the test
testStorageOptimization();