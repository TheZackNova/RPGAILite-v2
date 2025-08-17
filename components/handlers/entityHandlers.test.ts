import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entity, KnownEntities } from '../types';

// Mock a simple version of entity handlers for testing
const mockEntityHandlers = {
  createEntity: (name: string, type: string, description: string): Entity => ({
    name,
    type: type as any,
    description,
    referenceId: `${type}_${name.toLowerCase().replace(/\s+/g, '_')}`
  }),
  
  updateEntity: (entities: KnownEntities, name: string, updates: Partial<Entity>): KnownEntities => {
    if (!entities[name]) {
      throw new Error(`Entity "${name}" not found`);
    }
    
    return {
      ...entities,
      [name]: {
        ...entities[name],
        ...updates
      }
    };
  },
  
  deleteEntity: (entities: KnownEntities, name: string): KnownEntities => {
    if (!entities[name]) {
      throw new Error(`Entity "${name}" not found`);
    }
    
    const { [name]: deleted, ...remaining } = entities;
    return remaining;
  },
  
  findEntitiesByType: (entities: KnownEntities, type: string): Entity[] => {
    return Object.values(entities).filter(entity => entity.type === type);
  }
};

describe('Entity Handlers', () => {
  let testEntities: KnownEntities;

  beforeEach(() => {
    testEntities = {
      'Test NPC': {
        name: 'Test NPC',
        type: 'npc',
        description: 'A test NPC for unit testing',
        referenceId: 'npc_test_npc'
      },
      'Magic Sword': {
        name: 'Magic Sword',
        type: 'item',
        description: 'A powerful magical weapon',
        equippable: true,
        referenceId: 'item_magic_sword'
      },
      'Village Square': {
        name: 'Village Square',
        type: 'location',
        description: 'The central gathering place of the village',
        referenceId: 'location_village_square'
      }
    };
  });

  describe('createEntity', () => {
    it('should create a new entity with correct properties', () => {
      const entity = mockEntityHandlers.createEntity('New Character', 'npc', 'A newly created character');
      
      expect(entity.name).toBe('New Character');
      expect(entity.type).toBe('npc');
      expect(entity.description).toBe('A newly created character');
      expect(entity.referenceId).toBe('npc_new_character');
    });

    it('should handle special characters in names', () => {
      const entity = mockEntityHandlers.createEntity('Lê Minh-Hoàng', 'pc', 'Vietnamese character name');
      
      expect(entity.name).toBe('Lê Minh-Hoàng');
      expect(entity.referenceId).toContain('pc_');
    });
  });

  describe('updateEntity', () => {
    it('should update existing entity properties', () => {
      const updatedEntities = mockEntityHandlers.updateEntity(testEntities, 'Test NPC', {
        description: 'Updated description',
        location: 'New Location'
      });
      
      expect(updatedEntities['Test NPC'].description).toBe('Updated description');
      expect(updatedEntities['Test NPC'].location).toBe('New Location');
      expect(updatedEntities['Test NPC'].name).toBe('Test NPC'); // Should preserve unchanged properties
    });

    it('should throw error for non-existent entity', () => {
      expect(() => {
        mockEntityHandlers.updateEntity(testEntities, 'Non Existent', { description: 'New desc' });
      }).toThrow('Entity "Non Existent" not found');
    });

    it('should not affect other entities', () => {
      const originalSword = testEntities['Magic Sword'];
      const updatedEntities = mockEntityHandlers.updateEntity(testEntities, 'Test NPC', {
        description: 'Updated description'
      });
      
      expect(updatedEntities['Magic Sword']).toEqual(originalSword);
    });
  });

  describe('deleteEntity', () => {
    it('should remove entity from collection', () => {
      const updatedEntities = mockEntityHandlers.deleteEntity(testEntities, 'Test NPC');
      
      expect(updatedEntities['Test NPC']).toBeUndefined();
      expect(Object.keys(updatedEntities)).toHaveLength(2);
    });

    it('should throw error for non-existent entity', () => {
      expect(() => {
        mockEntityHandlers.deleteEntity(testEntities, 'Non Existent');
      }).toThrow('Entity "Non Existent" not found');
    });

    it('should preserve other entities', () => {
      const originalSword = testEntities['Magic Sword'];
      const updatedEntities = mockEntityHandlers.deleteEntity(testEntities, 'Test NPC');
      
      expect(updatedEntities['Magic Sword']).toEqual(originalSword);
    });
  });

  describe('findEntitiesByType', () => {
    it('should return entities of specified type', () => {
      const npcs = mockEntityHandlers.findEntitiesByType(testEntities, 'npc');
      
      expect(npcs).toHaveLength(1);
      expect(npcs[0].name).toBe('Test NPC');
    });

    it('should return empty array for non-existent type', () => {
      const skills = mockEntityHandlers.findEntitiesByType(testEntities, 'skill');
      
      expect(skills).toHaveLength(0);
    });

    it('should return all entities of specified type', () => {
      // Add another NPC
      testEntities['Another NPC'] = {
        name: 'Another NPC',
        type: 'npc',
        description: 'Second test NPC',
        referenceId: 'npc_another_npc'
      };
      
      const npcs = mockEntityHandlers.findEntitiesByType(testEntities, 'npc');
      
      expect(npcs).toHaveLength(2);
      expect(npcs.map(npc => npc.name)).toContain('Test NPC');
      expect(npcs.map(npc => npc.name)).toContain('Another NPC');
    });
  });
});