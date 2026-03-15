import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VideoPlayer from '../app/Components/Game/VideoPlayer';

describe('VideoPlayer Component', () => {
  const videoUrl = 'https://example.com/video.mp4';

  it('should render video element with correct src', () => {
    render(<VideoPlayer src={videoUrl} />);
    const video = screen.getByTestId('video-player') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.src).toBe(videoUrl);
  });

  it('should render img element if src is a gif', () => {
    const gifUrl = 'https://example.com/animation.gif';
    render(<VideoPlayer src={gifUrl} />);
    const img = screen.getByAltText(/Challenge Clip/i);
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).src).toBe(gifUrl);
  });

  it('should show error message if src is empty', () => {
    render(<VideoPlayer src="" />);
    expect(screen.getByText(/Video not available/i)).toBeInTheDocument();
  });
});
