export type StoryCategory = "jlpt" | "situation" | "story";

export interface StoryCatalogEntry {
  id: string;
  category: StoryCategory;
  kind?: "engine" | "standalone" | "jlpt-choukai";
  href?: string;
  thumbStyle?: "konbini" | "hachiko" | "jlpt" | "image";
  thumbImage?: string;
  artBadge?: string;
  titleJa: string;
  titleVi: string;
  level: string;
  description: string;
  sceneCount: number;
  vocabCount: number;
  grammarCount?: number;
  quizCount?: number;
  questionCount?: number;
  theme?: string;
}

export interface StoryCatalog {
  stories: StoryCatalogEntry[];
}
