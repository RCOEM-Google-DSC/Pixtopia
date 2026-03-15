import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MCQGrid from '../app/Components/Game/MCQGrid';

describe('MCQGrid Component', () => {
  const options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
  const onSelect = vi.fn();

  it('should render all 4 options', () => {
    render(<MCQGrid options={options} onSelect={onSelect} />);
    options.forEach(option => {
      expect(screen.getByText(option)).toBeInTheDocument();
    });
  });

  it('should call onSelect when an option is clicked', () => {
    render(<MCQGrid options={options} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Option 2'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('should highlight the selected option', () => {
    const { rerender } = render(<MCQGrid options={options} onSelect={onSelect} selectedIndex={2} />);
    const option3 = screen.getByText('Option 3').closest('button');
    expect(option3).toHaveClass('border-indigo-500');

    rerender(<MCQGrid options={options} onSelect={onSelect} selectedIndex={0} />);
    const option1 = screen.getByText('Option 1').closest('button');
    expect(option1).toHaveClass('border-indigo-500');
  });

  it('should disable selection when disabled prop is true', () => {
    render(<MCQGrid options={options} onSelect={onSelect} disabled={true} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });
});
