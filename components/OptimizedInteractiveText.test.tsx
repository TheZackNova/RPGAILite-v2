// components/OptimizedInteractiveText.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { OptimizedInteractiveText } from './OptimizedInteractiveText';
import type { KnownEntities } from './types';

describe('OptimizedInteractiveText - Dialogue Styling', () => {
  const mockKnownEntities: KnownEntities = {};
  const mockOnEntityClick = vi.fn();

  beforeEach(() => {
    mockOnEntityClick.mockClear();
  });

  test('should apply dialogue styling to text wrapped in double quotes', () => {
    const dialogueText = '"Chào người, ta là Tiểu Vũ, bạn cũng phòng của người phải không?"';
    
    render(
      <OptimizedInteractiveText 
        text={dialogueText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    // Find the dialogue span element
    const dialogueElement = screen.getByText(dialogueText);
    
    // Check if the dialogue styling classes are applied
    expect(dialogueElement).toHaveClass('text-cyan-400');
    expect(dialogueElement).toHaveClass('dark:text-cyan-300');
    expect(dialogueElement).toHaveClass('italic');
    expect(dialogueElement).toHaveClass('font-medium');
  });

  test('should apply dialogue styling to Vietnamese dialogue with quotes', () => {
    const vietnameseDialogue = '"Có bé đưa tay ra, chú động nắm lấy bàn tay người."';
    
    render(
      <OptimizedInteractiveText 
        text={vietnameseDialogue}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const dialogueElement = screen.getByText(vietnameseDialogue);
    expect(dialogueElement).toHaveClass('text-cyan-400', 'italic', 'font-medium');
  });

  test('should not apply dialogue styling to text without quotes', () => {
    const regularText = 'Ngay lập tức, một luồng nhiệt mạnh mẻ lan tỏa từ lòng bàn tay';
    
    render(
      <OptimizedInteractiveText 
        text={regularText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const textElement = screen.getByText(regularText);
    expect(textElement).not.toHaveClass('text-cyan-400');
    expect(textElement).not.toHaveClass('italic');
  });

  test('should handle mixed content with dialogue and regular text', () => {
    const mixedText = 'Cô bé nói: "Tiểu Vũ nóng ran, tiểu huyệt bên dưới bỏ động phục" và tiếp tục nói chuyện.';
    
    render(
      <OptimizedInteractiveText 
        text={mixedText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    // Should find the dialogue part styled correctly
    const dialoguePart = screen.getByText('"Tiểu Vũ nóng ran, tiểu huyệt bên dưới bỏ động phục"');
    expect(dialoguePart).toHaveClass('text-cyan-400', 'italic', 'font-medium');
  });

  test('should not apply dialogue styling to single quotes', () => {
    const singleQuoteText = "'This should not be styled as dialogue'";
    
    render(
      <OptimizedInteractiveText 
        text={singleQuoteText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const textElement = screen.getByText(singleQuoteText);
    expect(textElement).not.toHaveClass('text-cyan-400');
  });

  test('should not apply dialogue styling to empty quotes', () => {
    const emptyQuotes = '""';
    
    render(
      <OptimizedInteractiveText 
        text={emptyQuotes}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const textElement = screen.getByText(emptyQuotes);
    expect(textElement).not.toHaveClass('text-cyan-400');
  });

  test('should handle multiple dialogue parts in same text', () => {
    const multiDialogueText = 'Người đầu tiên nói: "Xin chào!" Người thứ hai trả lời: "Chào bạn!"';
    
    render(
      <OptimizedInteractiveText 
        text={multiDialogueText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    // Both dialogue parts should be styled
    const dialogue1 = screen.getByText('"Xin chào!"');
    const dialogue2 = screen.getByText('"Chào bạn!"');
    
    expect(dialogue1).toHaveClass('text-cyan-400', 'italic', 'font-medium');
    expect(dialogue2).toHaveClass('text-cyan-400', 'italic', 'font-medium');
  });

  test('should handle curly quotes and various quote types', () => {
    const curlyQuoteText = '"Chào bạn, tôi là Tiểu Vũ"';
    
    render(
      <OptimizedInteractiveText 
        text={curlyQuoteText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const dialogueElement = screen.getByText(curlyQuoteText);
    expect(dialogueElement).toHaveClass('text-cyan-400', 'italic', 'font-medium');
  });

  test('should handle tilde thoughts format', () => {
    const thoughtText = '~~Tôi phải cẩn thận hơn~~';
    
    render(
      <OptimizedInteractiveText 
        text={thoughtText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const thoughtElement = screen.getByText('Tôi phải cẩn thận hơn');
    expect(thoughtElement).toHaveClass('text-slate-600', 'dark:text-slate-400');
  });

  test('should handle both backtick and tilde thought formats', () => {
    const mixedText = 'Cô ấy nói `Tôi rất vui` và sau đó ~~nghĩ trong đầu~~.';
    
    render(
      <OptimizedInteractiveText 
        text={mixedText}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    const backtickThought = screen.getByText('Tôi rất vui');
    const tildeThought = screen.getByText('nghĩ trong đầu');
    
    expect(backtickThought).toHaveClass('text-slate-600');
    expect(tildeThought).toHaveClass('text-slate-600');
  });

  test('should clean standalone reference IDs without content', () => {
    const textWithRefs = 'Tiểu Vũ [REF_NP_CHA_133D5F1E] vẫn đứng đó, cơ thể khẽ run rẩy.';
    
    render(
      <OptimizedInteractiveText 
        text={textWithRefs}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    // Should not find the reference ID in the rendered text
    expect(screen.queryByText(/REF_NP_CHA_133D5F1E/)).not.toBeInTheDocument();
    
    // Should find the cleaned text without reference IDs
    expect(screen.getByText(/Tiểu Vũ vẫn đứng đó, cơ thể khẽ run rẩy/)).toBeInTheDocument();
  });

  test('should clean reference IDs with content and keep the content', () => {
    const textWithContentRefs = 'Gặp [REF_NP_CHA_123ABC: Tiểu Vũ] tại trường học.';
    
    render(
      <OptimizedInteractiveText 
        text={textWithContentRefs}
        onEntityClick={mockOnEntityClick}
        knownEntities={mockKnownEntities}
      />
    );

    // Should not find the reference ID in the rendered text
    expect(screen.queryByText(/REF_NP_CHA_123ABC/)).not.toBeInTheDocument();
    
    // Should find the content without the reference wrapper
    expect(screen.getByText(/Gặp Tiểu Vũ tại trường học/)).toBeInTheDocument();
  });
});