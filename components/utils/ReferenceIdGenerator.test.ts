import { describe, it, expect, vi } from 'vitest';
import { ReferenceIdGenerator } from './ReferenceIdGenerator';

describe('ReferenceIdGenerator', () => {
  describe('generateReferenceId', () => {
    it('should generate reference IDs with correct format', () => {
      const id1 = ReferenceIdGenerator.generateReferenceId('Test NPC', 'npc');
      const id2 = ReferenceIdGenerator.generateReferenceId('Test Item', 'item');
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^REF_NP_CHA_[A-F0-9]{8}$/);
      expect(id2).toMatch(/^REF_IT_ITE_[A-F0-9]{8}$/);
    });

    it('should handle Vietnamese characters correctly', () => {
      const id = ReferenceIdGenerator.generateReferenceId('Lê Minh', 'pc');
      
      expect(id).toMatch(/^REF_PC_CHA_[A-F0-9]{8}$/);
      expect(id).toBeTruthy();
    });

    it('should handle special characters and spaces', () => {
      const id = ReferenceIdGenerator.generateReferenceId('Test-Entity With Spaces!', 'location');
      
      expect(id).toMatch(/^REF_LO_LOC_[A-F0-9]{8}$/);
      expect(id).toBeTruthy();
    });

    it('should handle different entity types correctly', () => {
      const pcId = ReferenceIdGenerator.generateReferenceId('Hero', 'pc');
      const npcId = ReferenceIdGenerator.generateReferenceId('Villager', 'npc');
      const itemId = ReferenceIdGenerator.generateReferenceId('Sword', 'item');
      const locationId = ReferenceIdGenerator.generateReferenceId('Village', 'location');
      
      expect(pcId).toMatch(/^REF_PC_CHA_/);
      expect(npcId).toMatch(/^REF_NP_CHA_/);
      expect(itemId).toMatch(/^REF_IT_ITE_/);
      expect(locationId).toMatch(/^REF_LO_LOC_/);
    });
  });

  describe('validateReferenceId', () => {
    it('should validate correct reference ID format', () => {
      const validId = 'REF_PC_CHA_ABCDEF12';
      const invalidId = 'invalid_id';
      
      expect(ReferenceIdGenerator.validateReferenceId(validId)).toBe(true);
      expect(ReferenceIdGenerator.validateReferenceId(invalidId)).toBe(false);
    });

    it('should reject malformed reference IDs', () => {
      const malformedIds = [
        'REF_PC_CHA',  // Missing hash
        'REF_PC_CHA_123',  // Short hash
        'REF_PC_CHA_1234567G',  // Invalid hex character
        'PC_CHA_12345678',  // Missing REF prefix
        'REF_P_CHA_12345678',  // Short type prefix
        'REF_PC_CH_12345678'  // Short category prefix
      ];
      
      malformedIds.forEach(id => {
        expect(ReferenceIdGenerator.validateReferenceId(id)).toBe(false);
      });
    });
  });

  describe('parseReferenceId', () => {
    it('should parse valid reference ID correctly', () => {
      const validId = 'REF_PC_CHA_ABCDEF12';
      const result = ReferenceIdGenerator.parseReferenceId(validId);
      
      expect(result.valid).toBe(true);
      expect(result.typePrefix).toBe('PC');
      expect(result.categoryPrefix).toBe('CHA');
      expect(result.hash).toBe('ABCDEF12');
    });

    it('should return invalid for malformed reference ID', () => {
      const invalidId = 'invalid_reference_id';
      const result = ReferenceIdGenerator.parseReferenceId(invalidId);
      
      expect(result.valid).toBe(false);
      expect(result.typePrefix).toBeUndefined();
      expect(result.categoryPrefix).toBeUndefined();
      expect(result.hash).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const id = ReferenceIdGenerator.generateReferenceId('', 'npc');
      
      expect(id).toMatch(/^REF_NP_CHA_[A-F0-9]{8}$/);
      expect(ReferenceIdGenerator.validateReferenceId(id)).toBe(true);
    });

    it('should handle very long names', () => {
      const longName = 'A'.repeat(1000);
      const id = ReferenceIdGenerator.generateReferenceId(longName, 'npc');
      
      expect(id).toMatch(/^REF_NP_CHA_[A-F0-9]{8}$/);
      expect(ReferenceIdGenerator.validateReferenceId(id)).toBe(true);
    });

    it('should handle unknown entity types', () => {
      const id = ReferenceIdGenerator.generateReferenceId('Unknown', 'unknown_type');
      
      expect(id).toMatch(/^REF_UN_CON_[A-F0-9]{8}$/);
      expect(ReferenceIdGenerator.validateReferenceId(id)).toBe(true);
    });
  });
});