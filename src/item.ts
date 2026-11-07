// Item types shared by the item groups page, the items page and the item form.

// What kind of items an item group holds; it decides which fields its items get.
export const ITEM_TYPES = ['text', 'question'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// A question item as returned by the backend's /question-items and
// /item-groups/:id/question-items endpoints.
export interface QuestionItem {
  id: number;
  itemNumber: number;
  questionText: string | null;
  questionPrompt: string | null;
  answerKey: string | null;
  choices: string | null;
  itemGroupId: number;
}
