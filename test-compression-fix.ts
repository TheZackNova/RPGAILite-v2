/**
 * Test for History Compression Story Flow Fix
 * Tests the enhanced compression system that preserves choice context and story flow
 */

import { HistoryManager, type CompressedHistorySegment } from './components/HistoryManager';
import type { GameHistoryEntry } from './components/types';

// Mock game history entries with choices and story content
const mockHistoryEntries: GameHistoryEntry[] = [
    {
        role: 'user',
        parts: [{ text: '--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"Tấn công con goblin"' }]
    },
    {
        role: 'model',
        parts: [{
            text: JSON.stringify({
                story: "Bạn lao vào tấn công con goblin với thanh kiếm. Con quái vật réo lên và cố gắng phản kích.",
                choices: ["Tiếp tục tấn công", "Né tránh", "Dùng kỹ năng đặc biệt"],
                status: { health: 80 }
            })
        }]
    },
    {
        role: 'user',
        parts: [{ text: '--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"Tiếp tục tấn công"' }]
    },
    {
        role: 'model',
        parts: [{
            text: JSON.stringify({
                story: "Bạn đâm thẳng vào tim con goblin. Nó ngã xuống và chết. Bạn nhận được 50 điểm kinh nghiệm.",
                choices: ["Lấy chiến lợi phẩm", "Tiếp tục khám phá", "Nghỉ ngơi"],
                status: { health: 80, exp: 150 }
            })
        }]
    },
    {
        role: 'user',
        parts: [{ text: '--- HÀNH ĐỘNG CỦA NGƯỜI CHƠI ---\n"Lấy chiến lợi phẩm"' }]
    },
    {
        role: 'model',
        parts: [{
            text: JSON.stringify({
                story: "Bạn tìm kiếm xác con goblin và tìm thấy 5 đồng xu và một chiếc dao nhỏ.",
                choices: ["Cầm dao", "Chỉ lấy tiền", "Bỏ qua tất cả"],
                items: ["Dao goblin", "5 đồng xu"]
            })
        }]
    }
];

function testCompressionFix() {
    console.log('🧪 Testing History Compression Story Flow Fix...\n');
    
    // Test compression with the enhanced system
    const result = HistoryManager.manageHistory(
        mockHistoryEntries,
        45, // Turn number after compression threshold
        {
            maxActiveEntries: 2,
            compressionThreshold: 4, // Force compression
            summaryLength: 200
        }
    );
    
    console.log('📊 Compression Results:');
    console.log('- Should compress:', result.shouldCompress);
    console.log('- Original entries:', result.stats.originalSize);
    console.log('- Active entries kept:', result.stats.newSize);
    console.log('- Entries compressed:', result.stats.savedEntries);
    
    if (result.compressedSegment) {
        const segment = result.compressedSegment;
        console.log('\n📦 Compressed Segment:');
        console.log('- Turn range:', segment.turnRange);
        console.log('- Summary:', segment.summary);
        console.log('- Key actions:', segment.keyActions);
        console.log('- Important events:', segment.importantEvents);
        console.log('- Preserved choices:', segment.recentChoices); // NEW FIELD
        console.log('- Story flow:', segment.storyFlow); // NEW FIELD
        console.log('- Token count:', segment.tokenCount);
        
        // Test the fix: Check if choices and story flow are preserved
        const hasChoices = segment.recentChoices && segment.recentChoices.length > 0;
        const hasStoryFlow = segment.storyFlow && segment.storyFlow.length > 0;
        
        console.log('\n✅ Fix Verification:');
        console.log('- Choices preserved:', hasChoices ? '✓' : '✗');
        console.log('- Story flow preserved:', hasStoryFlow ? '✓' : '✗');
        
        if (hasChoices) {
            console.log('  → Preserved choices:', segment.recentChoices.join(', '));
        }
        if (hasStoryFlow) {
            console.log('  → Story flow patterns:', segment.storyFlow.join(' | '));
        }
        
        // Verify the fix addresses the original issues
        if (hasChoices && hasStoryFlow) {
            console.log('\n🎉 SUCCESS: The fix should prevent story looping and duplicate choices!');
            console.log('   The AI will now have access to compressed choice history and story flow.');
        } else {
            console.log('\n❌ ISSUES: Some data may still be lost during compression.');
        }
    }
}

// Run the test
testCompressionFix();