import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from './MainMenu';

// Mock the required props
const mockProps = {
  onStartNewAdventure: vi.fn(),
  onQuickPlay: vi.fn(),
  hasLastWorldSetup: false,
  onOpenApiSettings: vi.fn(),
  onLoadGameFromFile: vi.fn(),
  isUsingDefaultKey: true,
  onOpenChangelog: vi.fn(),
  selectedAiModel: 'gemini-2.5-flash'
};

describe('MainMenu', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should render the main menu title', () => {
    render(<MainMenu {...mockProps} />);
    
    expect(screen.getByText(/HÃY VIẾT LÊN/)).toBeInTheDocument();
    expect(screen.getByText(/CÂU TRUYỆN CỦA BẠN/)).toBeInTheDocument();
  });

  it('should render start new adventure button', () => {
    render(<MainMenu {...mockProps} />);
    
    const startButton = screen.getByText(/Tạo Thế Giới Mới/i);
    expect(startButton).toBeInTheDocument();
  });

  it('should call onStartNewAdventure when start button is clicked', () => {
    render(<MainMenu {...mockProps} />);
    
    const startButton = screen.getByText(/Tạo Thế Giới Mới/i);
    fireEvent.click(startButton);
    
    expect(mockProps.onStartNewAdventure).toHaveBeenCalledTimes(1);
  });

  it('should not render quick play when no last world setup exists', () => {
    render(<MainMenu {...mockProps} hasLastWorldSetup={false} />);
    
    expect(screen.queryByText(/Chơi Ngay/i)).not.toBeInTheDocument();
  });

  it('should render quick play when last world setup exists', () => {
    render(<MainMenu {...mockProps} hasLastWorldSetup={true} />);
    
    const quickPlayButton = screen.getByText(/Chơi Ngay/i);
    expect(quickPlayButton).toBeInTheDocument();
  });

  it('should call onQuickPlay when quick play button is clicked', () => {
    render(<MainMenu {...mockProps} hasLastWorldSetup={true} />);
    
    const quickPlayButton = screen.getByText(/Chơi Ngay/i);
    fireEvent.click(quickPlayButton);
    
    expect(mockProps.onQuickPlay).toHaveBeenCalledTimes(1);
  });

  it('should render load game button', () => {
    render(<MainMenu {...mockProps} />);
    
    expect(screen.getByText(/Tải Game Từ Tệp/i)).toBeInTheDocument();
  });

  it('should render API settings button', () => {
    render(<MainMenu {...mockProps} />);
    
    expect(screen.getByText(/Thiết Lập API Key/i)).toBeInTheDocument();
  });

  it('should call onOpenApiSettings when API settings button is clicked', () => {
    render(<MainMenu {...mockProps} />);
    
    const apiButton = screen.getByText(/Thiết Lập API Key/i);
    fireEvent.click(apiButton);
    
    expect(mockProps.onOpenApiSettings).toHaveBeenCalledTimes(1);
  });

  it('should render changelog button', () => {
    render(<MainMenu {...mockProps} />);
    
    expect(screen.getByText(/Xem Cập Nhật Game/i)).toBeInTheDocument();
  });

  it('should call onOpenChangelog when changelog button is clicked', () => {
    render(<MainMenu {...mockProps} />);
    
    const changelogButton = screen.getByText(/Xem Cập Nhật Game/i);
    fireEvent.click(changelogButton);
    
    expect(mockProps.onOpenChangelog).toHaveBeenCalledTimes(1);
  });

  it('should display current AI model', () => {
    render(<MainMenu {...mockProps} selectedAiModel="gemini-2.5-flash" />);
    
    expect(screen.getByText(/gemini-2.5-flash/i)).toBeInTheDocument();
  });

  it('should display AI model in footer', () => {
    render(<MainMenu {...mockProps} selectedAiModel="gemini-2.5-flash" />);
    
    expect(screen.getByText(/Model AI hiện tại:/)).toBeInTheDocument();
  });
});