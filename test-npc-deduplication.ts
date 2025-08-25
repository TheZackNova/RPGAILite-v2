// Test script to verify NPC deduplication fix
import type { Entity } from './components/types';

// Mock the entity merging logic from commandTagProcessor.ts
const simulateNPCCreation = (
    existingEntities: { [key: string]: Entity },
    newNPCAttributes: any
): { [key: string]: Entity } => {
    const entityName = newNPCAttributes.name;
    const existingNPC = existingEntities[entityName];
    
    // Simulate the fixed LORE_NPC logic
    if (existingNPC && existingNPC.type === 'npc') {
        console.log(`📝 Updating existing NPC: ${entityName}`);
        
        // Convert skills string to array if needed
        if (typeof newNPCAttributes.skills === 'string') {
            newNPCAttributes.skills = newNPCAttributes.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        
        // Merge attributes, preserving existing data when possible
        const updatedNPC: Entity = {
            ...existingNPC, // Preserve existing data
            ...newNPCAttributes, // Apply new data
            type: 'npc', // Ensure type stays correct
            referenceId: existingNPC.referenceId, // Keep original reference ID
            name: entityName // Ensure name consistency
        };
        
        console.log(`🔄 Updated NPC ${entityName} with new attributes`);
        return { ...existingEntities, [entityName]: updatedNPC };
    } else {
        // Create new NPC only if doesn't exist
        if (typeof newNPCAttributes.skills === 'string') {
            newNPCAttributes.skills = newNPCAttributes.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        const newNPC: Entity = { 
            type: 'npc', 
            referenceId: `REF_NP_CHA_${Date.now()}`, // Mock reference ID
            ...newNPCAttributes 
        };
        console.log(`🔗 Created new NPC ${entityName}: ${newNPC.referenceId}`);
        return { ...existingEntities, [entityName]: newNPC };
    }
};

// Test the deduplication fix
const testNPCDeduplication = () => {
    console.log('🧪 Testing NPC Deduplication Fix\n');
    
    // Initial empty entities
    let entities: { [key: string]: Entity } = {};
    
    console.log('=== Test 1: Creating new NPC ===');
    entities = simulateNPCCreation(entities, {
        name: "Horikita Suzune",
        description: "A cold and intelligent student",
        gender: "Nữ",
        age: "16", 
        appearance: "Black long hair, gray eyes",
        motivation: "Reach A-Class at any cost",
        location: "Classroom 1-D",
        personalityMbti: "INTJ",
        skills: "Academic Excellence,Quick Judgment"
    });
    
    console.log('\n=== Test 2: AI tries to recreate same NPC (old behavior would overwrite) ===');
    entities = simulateNPCCreation(entities, {
        name: "Horikita Suzune",
        description: "An aloof girl who sits at the front", // Different description
        gender: "Nữ",
        age: "16",
        relationship: "Acquaintance", // New attribute
        location: "Library" // Changed location
    });
    
    console.log('\n=== Test 3: Creating different NPC ===');
    entities = simulateNPCCreation(entities, {
        name: "Satou Maya",
        description: "A friendly classmate", 
        gender: "Nữ",
        age: "16",
        appearance: "Brown hair in ponytail",
        motivation: "Have fun school life",
        personalityMbti: "ESFJ"
    });
    
    console.log('\n=== Final Entity State ===');
    Object.values(entities).forEach(entity => {
        console.log(`\n📋 ${entity.name} (${entity.type}) - ${entity.referenceId}`);
        console.log(`   Description: ${entity.description}`);
        console.log(`   Location: ${entity.location}`);
        console.log(`   Skills: ${entity.skills}`);
        if (entity.relationship) console.log(`   Relationship: ${entity.relationship}`);
    });
    
    console.log('\n✅ Test Results:');
    console.log(`- Total entities: ${Object.keys(entities).length}`);
    console.log('- Horikita Suzune should have merged description and added relationship');
    console.log('- Original reference ID should be preserved');  
    console.log('- Location should be updated to "Library"');
    console.log('- Satou Maya should be created as new entity');
    
    const horikita = entities["Horikita Suzune"];
    if (horikita) {
        console.log(`\n🔍 Horikita Suzune merge result:`);
        console.log(`   - Description: "${horikita.description}" (should be updated)`);
        console.log(`   - Location: "${horikita.location}" (should be "Library")`);
        console.log(`   - Relationship: "${horikita.relationship}" (should be "Acquaintance")`);
        console.log(`   - Skills preserved: ${JSON.stringify(horikita.skills)}`);
    }
};

// Test the anti-duplication context building
const testAntiDuplicationContext = () => {
    console.log('\n🧪 Testing Anti-Duplication Context Building\n');
    
    const mockGameState = {
        knownEntities: {
            "Horikita Suzune": { name: "Horikita Suzune", type: "npc" },
            "Satou Maya": { name: "Satou Maya", type: "npc" }, 
            "Classroom 1-D": { name: "Classroom 1-D", type: "location" },
            "Steel Sword": { name: "Steel Sword", type: "item" }
        }
    } as any;
    
    const entityNames = Object.keys(mockGameState.knownEntities);
    const antiDupText = `**⚠️ THỰC THỂ ĐÃ TỒN TẠI - KHÔNG TẠO LẠI:** ${entityNames.join(', ')}\n\n`;
    
    console.log('📝 Anti-duplication context that will be sent to AI:');
    console.log(`"${antiDupText}"`);
    
    console.log(`\n✅ This warning will inform AI about ${entityNames.length} existing entities`);
    console.log('   AI should use ENTITY_UPDATE instead of LORE_NPC for existing characters');
};

// Run tests
testNPCDeduplication();
testAntiDuplicationContext();