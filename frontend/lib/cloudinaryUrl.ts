/**
 * Cloudinary URL utilities for Round 4
 * Constructs URLs for images and videos based on question order
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dlvkywzol";
const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

/**
 * Get Cloudinary image URL for Round 4 Part A (rebus puzzles)
 * Images are stored as: round4/q{order}_img{imageIndex}.png
 * @param questionOrder - Question number (1-7)
 * @param imageIndex - Image number (1 or 2)
 * @returns Cloudinary URL for the image
 */
export function getRound4ImageUrl(questionOrder: number, imageIndex: 1 | 2): string {
  return `${CLOUDINARY_BASE}/image/upload/round4/q${questionOrder}_img${imageIndex}`;
}

/**
 * Get Cloudinary video URL for Round 4 Part B (video MCQ)
 * Videos are stored as: round4/{order}.mp4
 * @param questionOrder - Question number (8-10)
 * @returns Cloudinary URL for the video
 */
export function getRound4VideoUrl(questionOrder: number): string {
  return `${CLOUDINARY_BASE}/video/upload/round4/${questionOrder}.mp4`;
}

/**
 * Get both image URLs for a Round 4 Part A question
 * @param questionOrder - Question number (1-7)
 * @returns Array of two Cloudinary URLs for the images
 */
export function getRound4ImageUrls(questionOrder: number): [string, string] {
  return [
    getRound4ImageUrl(questionOrder, 1),
    getRound4ImageUrl(questionOrder, 2),
  ];
}
