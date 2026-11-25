export type StoryCategory = "situation" | "story";

export interface StoryCatalogEntry {
  id: string;
  category: StoryCategory;
  kind?: "engine" | "standalone";
  href?: string;
  thumbStyle?: "konbini" | "hachiko" | "image";
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
  theme?: string;
}

export interface StoryCatalog {
  stories: StoryCatalogEntry[];
}
