// Item types shared by the item groups page, the items page and the item form.

// What kind of items an item group holds; it decides which fields its items get.
export const ITEM_TYPES = ['text', 'question'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// How an item group's items are presented (backend enum ItemDisplayType).
export const DISPLAY_TYPES = ['scrolling', 'individual_screen'] as const;
export type ItemDisplayType = (typeof DISPLAY_TYPES)[number];

// A question item's format (QuestionItem.format on the backend): its number and display name.
export const QUESTION_FORMATS = [
  { value: 1, label: 'Cloze' },
  { value: 2, label: 'Button Cloze' },
  { value: 3, label: 'Button Select' },
  { value: 6, label: 'Words Scramble' },
  { value: 8, label: 'Words Select' },
] as const;

// A question item as returned by the backend's /question-items and
// /item-groups/:id/question-items endpoints.
export interface QuestionItem {
  id: number;
  itemNumber: number;
  questionText: string | null;
  questionPrompt: string | null;
  answerKey: string | null;
  choices: string | null;
  format: number;
  media: string | null; // text with inline images, ![](<url>)
  explanation: string | null;
  showExplanationWhenCorrect: boolean; // explanation also after a correct answer
  itemGroupId: number;
}
