import { describe, it, expect } from 'vitest';
import type { Entity, Quest, Memory, CustomRule } from './types';
import { RuleLogic } from './types';

describe('Types', () => {
  describe('Entity', () => {
    it('should create a valid PC entity', () => {
      const pcEntity: Entity = {
        name: 'Test Character',
        type: 'pc',
        description: 'A test player character',
        gender: 'Nam',
        age: '25',
        appearance: 'Tall and strong',
        personality: 'Brave and determined',
        motivation: 'Save the world',
        location: 'Starting Village',
        realm: 'Luyện Khí',
        currentExp: 100,
        learnedSkills: ['Basic Sword', 'Meditation'],
        referenceId: 'pc_test123'
      };

      expect(pcEntity.name).toBe('Test Character');
      expect(pcEntity.type).toBe('pc');
      expect(pcEntity.learnedSkills).toHaveLength(2);
    });

    it('should create a valid NPC entity', () => {
      const npcEntity: Entity = {
        name: 'Village Elder',
        type: 'npc',
        description: 'Wise old man who guides newcomers',
        gender: 'Nam',
        age: '70',
        personality: 'Wise and patient',
        personalityMbti: 'INFJ',
        skills: ['Ancient Knowledge', 'Herb Lore'],
        location: 'Village Center',
        referenceId: 'npc_elder456'
      };

      expect(npcEntity.name).toBe('Village Elder');
      expect(npcEntity.type).toBe('npc');
      expect(npcEntity.skills).toContain('Ancient Knowledge');
    });

    it('should create a valid item entity', () => {
      const itemEntity: Entity = {
        name: 'Healing Potion',
        type: 'item',
        description: 'Restores health when consumed',
        quantities: 5,
        usable: true,
        consumable: true,
        owner: 'pc',
        referenceId: 'item_potion789'
      };

      expect(itemEntity.name).toBe('Healing Potion');
      expect(itemEntity.type).toBe('item');
      expect(itemEntity.usable).toBe(true);
      expect(itemEntity.quantities).toBe(5);
    });
  });

  describe('Quest', () => {
    it('should create a valid quest', () => {
      const quest: Quest = {
        title: 'Find the Lost Artifact',
        description: 'An ancient artifact has been lost in the nearby caves',
        objectives: [
          { description: 'Enter the cave system', completed: true },
          { description: 'Find the artifact', completed: false },
          { description: 'Return to the village', completed: false }
        ],
        giver: 'Village Elder',
        reward: 'Gold coins and experience',
        isMainQuest: true,
        status: 'active'
      };

      expect(quest.title).toBe('Find the Lost Artifact');
      expect(quest.objectives).toHaveLength(3);
      expect(quest.objectives[0].completed).toBe(true);
      expect(quest.status).toBe('active');
    });
  });

  describe('Memory', () => {
    it('should create a valid memory', () => {
      const memory: Memory = {
        text: 'Met the village elder who gave me a quest',
        pinned: false,
        createdAt: 1,
        lastAccessed: 1,
        source: 'manual',
        category: 'social',
        importance: 75,
        relatedEntities: ['Village Elder'],
        tags: ['quest', 'npc', 'meeting'],
        emotionalWeight: 5
      };

      expect(memory.text).toBe('Met the village elder who gave me a quest');
      expect(memory.importance).toBe(75);
      expect(memory.relatedEntities).toContain('Village Elder');
      expect(memory.tags).toContain('quest');
    });
  });

  describe('CustomRule', () => {
    it('should create a valid custom rule', () => {
      const rule: CustomRule = {
        id: 'rule_123',
        content: 'Magic is rare and powerful in this world',
        isActive: true,
        title: 'Magic System',
        keywords: ['magic', 'spell', 'mana'],
        secondaryKeywords: ['wizard', 'enchant'],
        logic: RuleLogic.AND_ANY,
        order: 100,
        alwaysActive: false,
        caseSensitive: false,
        matchWholeWords: true,
        probability: 90,
        maxActivationsPerTurn: 2,
        scanDepth: 3,
        scanPlayerInput: true,
        scanAIOutput: true,
        scanMemories: false,
        tokenWeight: 50,
        tokenPriority: 80,
        createdAt: Date.now(),
        lastActivated: 0,
        activationCount: 0,
        category: 'worldbuilding'
      };

      expect(rule.id).toBe('rule_123');
      expect(rule.content).toBe('Magic is rare and powerful in this world');
      expect(rule.keywords).toContain('magic');
      expect(rule.logic).toBe(RuleLogic.AND_ANY);
    });
  });
});