import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SegmentedInput from '../app/Components/Game/SegmentedInput';

describe('SegmentedInput Component', () => {
  it('should render correct number of input blocks', () => {
    render(<SegmentedInput length={5} value="" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBe(5);
  });

  it('should auto-focus the next input after typing', () => {
    render(<SegmentedInput length={5} value="" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    
    fireEvent.change(inputs[0], { target: { value: 'A' } });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('should focus previous input on backspace if current is empty', () => {
    render(<SegmentedInput length={5} value="A" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    
    // Start with second input focused
    inputs[1].focus();
    expect(document.activeElement).toBe(inputs[1]);
    
    fireEvent.keyDown(inputs[1], { key: 'Backspace' });
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('should call onChange with full string', () => {
    const handleChange = vi.fn();
    render(<SegmentedInput length={5} value="" onChange={handleChange} />);
    const inputs = screen.getAllByRole('textbox');
    
    fireEvent.change(inputs[0], { target: { value: 'A' } });
    expect(handleChange).toHaveBeenCalledWith('A....');
  });

  it('should display revealed letters as hints and not allow changing them', () => {
    const revealedIndices = [0, 2];
    // value is pre-filled by parent
    render(<SegmentedInput length={5} value="G.O.." onChange={vi.fn()} revealedIndices={revealedIndices} />);
    const inputs = screen.getAllByRole('textbox');
    
    expect((inputs[0] as HTMLInputElement).value).toBe('G');
    expect((inputs[2] as HTMLInputElement).value).toBe('O');
    
    // Revealed inputs should be readOnly
    expect((inputs[0] as HTMLInputElement).readOnly).toBe(true);
    expect((inputs[2] as HTMLInputElement).readOnly).toBe(true);
    expect((inputs[1] as HTMLInputElement).readOnly).toBe(false);
  });
});
